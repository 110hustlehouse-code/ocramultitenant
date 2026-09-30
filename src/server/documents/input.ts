import { z } from "zod";

export const uploadMetaSchema = z.object({
  name: z.string().trim().min(1).max(300),
  type: z.string().trim().min(1).max(200),
  size: z.number().int().positive(),
});

export type UploadMeta = z.infer<typeof uploadMetaSchema>;
