import { Router } from 'express';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  listLabelsController,
  upsertLabelController,
  associateLabelController,
  removeLabelAssociationController,
} from '../controllers/labelController.js';
import {
  createLabelSchema,
  associateLabelSchema,
  labelIdParam,
  removeAssociationQuerySchema,
} from '../validators/labelValidators.js';

const router = Router({ mergeParams: true });

router.get('/', listLabelsController);
router.post('/', validateBody(createLabelSchema), upsertLabelController);
router.post(
  '/:labelId/associate',
  validateParams(labelIdParam),
  validateBody(associateLabelSchema),
  associateLabelController
);
router.delete(
  '/:labelId/associate',
  validateParams(labelIdParam),
  validateQuery(removeAssociationQuerySchema),
  removeLabelAssociationController
);

export default router;
