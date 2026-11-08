import type { Request, Response } from "express";
import { paginationSchema, uuidSchema } from "../../shared/pagination";
import { classInputSchema, classUpdateSchema } from "./class.schemas";
import { ClassService } from "./class.service";

export class ClassController {
  constructor(private readonly service: ClassService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    const input = paginationSchema.parse(request.query);
    response.json({
      data: await this.service.list(input, request.authUser!, request.query.enrolled === "true"),
    });
  };

  mine = async (request: Request, response: Response): Promise<void> => {
    const input = paginationSchema.parse(request.query);
    const enrolled = request.authUser!.role === "STUDENT";
    response.json({ data: await this.service.list(input, request.authUser!, enrolled) });
  };

  semesters = async (_request: Request, response: Response): Promise<void> => {
    response.json({ data: { semesters: await this.service.listSemesters() } });
  };

  lecturers = async (_request: Request, response: Response): Promise<void> => {
    response.json({ data: { lecturers: await this.service.listLecturers() } });
  };

  getOne = async (request: Request, response: Response): Promise<void> => {
    response.json({ data: { classSection: await this.service.getOne(uuidSchema.parse(request.params.classId), request.authUser!) } });
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const input = classInputSchema.parse(request.body);
    response.status(201).json({ data: { classSection: await this.service.create(input) } });
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const input = classUpdateSchema.parse(request.body);
    response.json({
      data: { classSection: await this.service.update(uuidSchema.parse(request.params.classId), input) },
    });
  };

  delete = async (request: Request, response: Response): Promise<void> => {
    await this.service.delete(uuidSchema.parse(request.params.classId));
    response.status(204).end();
  };

  enroll = async (request: Request, response: Response): Promise<void> => {
    await this.service.enroll(uuidSchema.parse(request.params.classId), request.authUser!.id);
    response.status(201).json({ data: { message: "Enrolled in class." } });
  };

  unenroll = async (request: Request, response: Response): Promise<void> => {
    await this.service.unenroll(uuidSchema.parse(request.params.classId), request.authUser!.id);
    response.status(204).end();
  };
}
