import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './characters.controller.js';
import {
  addReferenceSchema,
  referenceParamSchema,
  characterIdParamSchema,
  createCharacterSchema,
  listCharactersQuerySchema,
  updateCharacterSchema,
} from './characters.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listCharactersQuerySchema }), controller.list);
router.post('/', validate({ body: createCharacterSchema }), controller.create);

router.get('/:characterId', validate({ params: characterIdParamSchema }), controller.detail);
router.patch(
  '/:characterId',
  validate({ params: characterIdParamSchema, body: updateCharacterSchema }),
  controller.update,
);
router.delete('/:characterId', validate({ params: characterIdParamSchema }), controller.remove);

// The identity lock is a deliberate, separate action — never a side effect of a
// field edit, so a user always knows when their character's look was frozen.
router.post('/:characterId/lock', validate({ params: characterIdParamSchema }), controller.lock);
router.post(
  '/:characterId/unlock',
  validate({ params: characterIdParamSchema }),
  controller.unlock,
);

// Reference images steer every future illustration of this character.
router.post(
  '/:characterId/references',
  validate({ params: characterIdParamSchema, body: addReferenceSchema }),
  controller.addReference,
);
router.delete(
  '/:characterId/references/:assetId',
  validate({ params: referenceParamSchema }),
  controller.removeReference,
);

export default router;
