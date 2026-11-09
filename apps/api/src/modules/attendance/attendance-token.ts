import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { UnauthorizedError } from "../../shared/errors";

export const QR_ROTATION_SECONDS = 30;
const QR_ISSUER = "campushub-attendance";
const QR_AUDIENCE = "attendance-check-in";

const claimsSchema = z.object({
  sub: z.string().uuid(),
  purpose: z.literal("attendance-check-in"),
  slot: z.number().int().nonnegative(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  iss: z.literal(QR_ISSUER),
  aud: z.literal(QR_AUDIENCE),
});

export interface VerifiedQrToken {
  sessionId: string;
  slot: number;
  expiresAt: Date;
}

export function hashSessionNonce(): string {
  return createHash("sha256").update(randomUUID()).digest("hex");
}

export function issueQrToken(
  sessionId: string,
  secret: string,
  now: Date = new Date(),
): { token: string; slot: number; expiresAt: Date; rotationSeconds: number } {
  assertQrSecret(secret);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const slot = Math.floor(nowSeconds / QR_ROTATION_SECONDS);
  const expiresAtSeconds = (slot + 1) * QR_ROTATION_SECONDS;
  const token = jwt.sign(
    { purpose: "attendance-check-in", slot, iat: nowSeconds, exp: expiresAtSeconds },
    secret,
    {
      algorithm: "HS256",
      subject: sessionId,
      issuer: QR_ISSUER,
      audience: QR_AUDIENCE,
    },
  );
  return {
    token,
    slot,
    expiresAt: new Date(expiresAtSeconds * 1000),
    rotationSeconds: QR_ROTATION_SECONDS,
  };
}

export function verifyQrToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): VerifiedQrToken {
  assertQrSecret(secret);
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: QR_ISSUER,
      audience: QR_AUDIENCE,
      clockTimestamp: Math.floor(now.getTime() / 1000),
    });
    const claims = claimsSchema.parse(payload);
    const currentSlot = Math.floor(now.getTime() / 1000 / QR_ROTATION_SECONDS);
    if (claims.slot !== currentSlot) throw new UnauthorizedError("QR code has expired.");
    return {
      sessionId: claims.sub,
      slot: claims.slot,
      expiresAt: new Date(claims.exp * 1000),
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError("QR code is invalid or expired.");
  }
}

function assertQrSecret(secret: string): void {
  if (secret.length < 32) throw new Error("ATTENDANCE_QR_SECRET must be at least 32 characters.");
}
