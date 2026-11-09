import type { Request, Response } from "express";
import { pipeline } from "node:stream/promises";
import { uuidSchema } from "../../shared/pagination";
import {
  assignmentInputSchema,
  assignmentListQuerySchema,
  assignmentUpdateSchema,
  gradeInputSchema,
  submissionInputSchema,
  submissionListQuerySchema,
} from "./assignment.schemas";
import { AssignmentService } from "./assignment.service";

export class AssignmentController {
  constructor(private readonly service: AssignmentService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    response.json({
      data: await this.service.list(
        assignmentListQuerySchema.parse(request.query),
        request.authUser!,
      ),
    });
  };

  getOne = async (request: Request, response: Response): Promise<void> => {
    response.json({
      data: {
        assignment: await this.service.getOne(
          uuidSchema.parse(request.params.assignmentId),
          request.authUser!,
        ),
      },
    });
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const assignment = await this.service.create(
      uuidSchema.parse(request.params.classId),
      request.authUser!.id,
      assignmentInputSchema.parse(request.body),
      request.file,
    );
    response.status(201).json({ data: { assignment } });
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const assignment = await this.service.update(
      uuidSchema.parse(request.params.assignmentId),
      request.authUser!.id,
      assignmentUpdateSchema.parse(request.body),
      request.file,
    );
    response.json({ data: { assignment } });
  };

  delete = async (request: Request, response: Response): Promise<void> => {
    await this.service.delete(uuidSchema.parse(request.params.assignmentId), request.authUser!.id);
    response.status(204).end();
  };

  submit = async (request: Request, response: Response): Promise<void> => {
    const input = submissionInputSchema.parse(request.body);
    const submission = await this.service.submit(
      uuidSchema.parse(request.params.assignmentId),
      request.authUser!.id,
      input.textContent,
      request.file,
    );
    response.status(201).json({ data: { submission } });
  };

  mySubmission = async (request: Request, response: Response): Promise<void> => {
    response.json({
      data: {
        submission: await this.service.mySubmission(
          uuidSchema.parse(request.params.assignmentId),
          request.authUser!.id,
        ),
      },
    });
  };

  submissions = async (request: Request, response: Response): Promise<void> => {
    response.json({
      data: await this.service.listSubmissions(
        uuidSchema.parse(request.params.assignmentId),
        request.authUser!.id,
        submissionListQuerySchema.parse(request.query),
      ),
    });
  };

  grade = async (request: Request, response: Response): Promise<void> => {
    const submission = await this.service.grade(
      uuidSchema.parse(request.params.assignmentId),
      uuidSchema.parse(request.params.submissionId),
      request.authUser!.id,
      gradeInputSchema.parse(request.body),
    );
    response.json({ data: { submission } });
  };

  classGrades = async (request: Request, response: Response): Promise<void> => {
    response.json({
      data: await this.service.classGrades(
        uuidSchema.parse(request.params.classId),
        request.authUser!.id,
      ),
    });
  };

  exportClassGrades = async (request: Request, response: Response): Promise<void> => {
    const csv = await this.service.exportClassGrades(
      uuidSchema.parse(request.params.classId),
      request.authUser!,
    );
    response
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="grades-class-${request.params.classId}.csv"`,
      )
      .setHeader("X-Content-Type-Options", "nosniff")
      .send(csv);
  };

  downloadAttachment = async (request: Request, response: Response): Promise<void> => {
    const file = await this.service.downloadAttachment(
      uuidSchema.parse(request.params.assignmentId),
      request.authUser!,
    );
    response
      .setHeader("Content-Type", file.contentType)
      .setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`)
      .setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(file.contents, response);
  };

  downloadSubmission = async (request: Request, response: Response): Promise<void> => {
    const file = await this.service.downloadSubmissionFile(
      uuidSchema.parse(request.params.assignmentId),
      uuidSchema.parse(request.params.submissionId),
      request.authUser!,
    );
    response
      .setHeader("Content-Type", file.contentType)
      .setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`)
      .setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(file.contents, response);
  };

  downloadSubmissionVersion = async (request: Request, response: Response): Promise<void> => {
    const file = await this.service.downloadSubmissionVersion(
      uuidSchema.parse(request.params.assignmentId),
      uuidSchema.parse(request.params.submissionId),
      uuidSchema.parse(request.params.versionId),
      request.authUser!,
    );
    response
      .setHeader("Content-Type", file.contentType)
      .setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`)
      .setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(file.contents, response);
  };
}
