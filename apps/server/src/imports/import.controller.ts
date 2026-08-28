import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { ImportService, type ImportDraftOptions, type ScreenshotSource } from './import.service.js';
import { visionPositionSchema, type VisionPosition } from './vision-validation.js';

const allowedMime = new Set(['image/png', 'image/jpeg', 'image/webp']);

type ImportDraftOptionBody = {
  scope?: string;
  observedAt?: string;
  capturedAt?: string;
  timePrecision?: string;
  sourceTimezone?: string;
};

const readImportDraftOptions = (body: ImportDraftOptionBody): ImportDraftOptions => {
  const options: ImportDraftOptions = {};
  if (body.scope === 'FULL' || body.scope === 'PARTIAL') options.scope = body.scope;
  if (body.observedAt) options.observedAt = body.observedAt;
  if (body.capturedAt) options.capturedAt = body.capturedAt;
  if (body.timePrecision === 'INSTANT' || body.timePrecision === 'DATE')
    options.timePrecision = body.timePrecision;
  if (body.sourceTimezone) options.sourceTimezone = body.sourceTimezone;
  return options;
};

export const matchesSignature = (buffer: Buffer, mime: string) => {
  if (mime === 'image/png')
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg')
    return (
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9
    );
  if (mime === 'image/webp')
    return (
      buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP'
    );
  return false;
};

@Controller('imports')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post('screenshot')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string>,
  ) {
    if (!file || !allowedMime.has(file.mimetype) || !matchesSignature(file.buffer, file.mimetype))
      throw new BadRequestException('仅支持内容有效的 PNG、JPG、JPEG 或 WebP 图片');
    let extracted: VisionPosition[];
    try {
      extracted = z.array(visionPositionSchema).parse(JSON.parse(body.extracted ?? '[]'));
    } catch {
      throw new BadRequestException('extracted 必须是包含十进制字符串的合法 JSON');
    }
    const temporal = readImportDraftOptions(body);
    return this.imports.createDraft(
      body.accountId ?? '',
      file.buffer,
      (body.source ?? 'unknown') as ScreenshotSource,
      extracted,
      Number(body.sourceConfidence ?? (body.source === 'unknown' ? 0 : 1)),
      temporal,
    );
  }

  @Post(':id/commit')
  commit(
    @Param('id') id: string,
    @Body()
    body: { rows?: unknown[]; source?: ScreenshotSource } & ImportDraftOptions,
  ) {
    return this.imports.commit(id, body.rows ?? [], body.source, readImportDraftOptions(body));
  }

  @Post(':id/rebaseline')
  rebaseline(@Param('id') id: string) {
    return this.imports.rebaseline(id);
  }

  @Post(':id/rollback')
  rollback(@Param('id') id: string) {
    return this.imports.rollback(id);
  }

  @Get()
  history(@Query('accountId') accountId: string) {
    return this.imports.history(accountId);
  }
}
