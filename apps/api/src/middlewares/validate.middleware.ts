import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
export const validate = (schema: z.ZodTypeAny) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation Error",
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message
          }))
        });
      }
      return res.status(500).json({
        success: false,
        message: "Internal Server Error"
      });
    }
  };
};
