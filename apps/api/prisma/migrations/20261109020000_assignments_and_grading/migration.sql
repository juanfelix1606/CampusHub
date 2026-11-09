ALTER TABLE "Assignment"
ADD COLUMN "allowLate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "attachmentKey" TEXT,
ADD COLUMN "attachmentFileName" TEXT,
ADD COLUMN "attachmentContentType" TEXT;

ALTER TABLE "Assignment"
ADD CONSTRAINT "Assignment_maxScore_positive" CHECK ("maxScore" > 0);

ALTER TABLE "Submission"
ALTER COLUMN "fileKey" DROP NOT NULL,
ALTER COLUMN "fileName" DROP NOT NULL,
ALTER COLUMN "score" TYPE DECIMAL(6,2),
ADD COLUMN "textContent" TEXT,
ADD COLUMN "contentType" TEXT,
ADD COLUMN "isLate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD CONSTRAINT "Submission_score_nonnegative" CHECK ("score" IS NULL OR "score" >= 0),
ADD CONSTRAINT "Submission_version_positive" CHECK ("version" > 0),
ADD CONSTRAINT "Submission_content_present" CHECK (
  NULLIF(BTRIM("textContent"), '') IS NOT NULL OR "fileKey" IS NOT NULL
);

CREATE TABLE "SubmissionVersion" (
  "id" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "textContent" TEXT,
  "fileKey" TEXT,
  "fileName" TEXT,
  "contentType" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isLate" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "SubmissionVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubmissionVersion_version_positive" CHECK ("version" > 0),
  CONSTRAINT "SubmissionVersion_content_present" CHECK (
    NULLIF(BTRIM("textContent"), '') IS NOT NULL OR "fileKey" IS NOT NULL
  )
);

INSERT INTO "SubmissionVersion" (
  "id", "submissionId", "version", "textContent", "fileKey", "fileName",
  "contentType", "submittedAt", "isLate"
)
SELECT gen_random_uuid(), "id", 1, NULL, "fileKey", "fileName", NULL, "submittedAt", false
FROM "Submission";

CREATE UNIQUE INDEX "SubmissionVersion_submissionId_version_key"
ON "SubmissionVersion"("submissionId", "version");
CREATE INDEX "SubmissionVersion_submissionId_submittedAt_idx"
ON "SubmissionVersion"("submissionId", "submittedAt");

ALTER TABLE "SubmissionVersion"
ADD CONSTRAINT "SubmissionVersion_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "Submission"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GradeAudit" (
  "id" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "graderId" UUID NOT NULL,
  "previousScore" DECIMAL(6,2),
  "score" DECIMAL(6,2) NOT NULL,
  "previousFeedback" TEXT,
  "feedback" TEXT,
  "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradeAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GradeAudit_score_nonnegative" CHECK ("score" >= 0)
);

CREATE INDEX "GradeAudit_submissionId_gradedAt_idx"
ON "GradeAudit"("submissionId", "gradedAt");
ALTER TABLE "GradeAudit"
ADD CONSTRAINT "GradeAudit_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "Submission"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "GradeAudit_graderId_fkey"
FOREIGN KEY ("graderId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION enforce_submission_score_limit() RETURNS TRIGGER AS $$
DECLARE
  assignment_max_score INTEGER;
BEGIN
  IF NEW."score" IS NOT NULL THEN
    SELECT "maxScore" INTO assignment_max_score
    FROM "Assignment" WHERE "id" = NEW."assignmentId";
    IF NEW."score" < 0 OR NEW."score" > assignment_max_score THEN
      RAISE EXCEPTION 'Submission score exceeds assignment maximum'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Submission_score_within_assignment_limit"
BEFORE INSERT OR UPDATE OF "score", "assignmentId" ON "Submission"
FOR EACH ROW EXECUTE FUNCTION enforce_submission_score_limit();

CREATE FUNCTION enforce_assignment_max_score() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Submission"
    WHERE "assignmentId" = NEW."id" AND "score" > NEW."maxScore"
  ) THEN
    RAISE EXCEPTION 'Assignment maximum cannot be lower than an existing grade'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Assignment_max_score_above_existing_grades"
BEFORE UPDATE OF "maxScore" ON "Assignment"
FOR EACH ROW EXECUTE FUNCTION enforce_assignment_max_score();
