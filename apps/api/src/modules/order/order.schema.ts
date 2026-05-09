import { z } from 'zod';

export const CreateOrderSchema = z.object({
  productId: z
    .string()
    .min(1, "ProductId must not be empty"),
  userEmail: z.email({ message: "Invalid email address" }),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;