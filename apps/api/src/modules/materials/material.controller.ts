import type { Request, Response } from "express";
import { paginationSchema, uuidSchema } from "../../shared/pagination";
import { materialFieldsSchema, materialUpdateSchema } from "./material.schemas";
import { MaterialService } from "./material.service";

export class MaterialController {
  constructor(private readonly service: MaterialService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    const { page, pageSize } = paginationSchema.parse(request.query);
    response.json({
      data: await this.service.list(
        uuidSchema.parse(request.params.classId),
        request.authUser!,
        page,
        pageSize,
      ),
    });
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const input = materialFieldsSchema.parse(request.body);
    const material = await this.service.create(
      uuidSchema.parse(request.params.classId),
      request.authUser!.id,
      input,
      request.file,
    );
    response.status(201).json({ data: { material } });
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const input =
      request.file && Object.keys(request.body as object).length === 0
        ? {}
        : materialUpdateSchema.parse(request.body);
    const material = await this.service.update(
      uuidSchema.parse(request.params.materialId),
      request.authUser!.id,
      input,
      request.file,
    );
    response.json({ data: { material } });
  };

  delete = async (request: Request, response: Response): Promise<void> => {
    await this.service.delete(uuidSchema.parse(request.params.materialId), request.authUser!.id);
    response.status(204).end();
  };

  download = async (request: Request, response: Response): Promise<void> => {
    const { material, contents } = await this.service.download(
      uuidSchema.parse(request.params.materialId),
      request.authUser!,
    );
    response
      .setHeader("Content-Type", material.contentType)
      .setHeader("Content-Disposition", `attachment; filename="${material.fileName}"`)
      .setHeader("X-Content-Type-Options", "nosniff")
      .send(contents);
  };
}
