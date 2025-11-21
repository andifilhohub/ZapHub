import Joi from 'joi';

export const labelIdParam = Joi.object({
  labelId: Joi.string().required().description('External label ID reported by WhatsApp'),
});

export const createLabelSchema = Joi.object({
  labelId: Joi.string().required().description('External label ID (as provided by WhatsApp/Chatwoot)'),
  name: Joi.string().optional().allow(null, '').description('Label name'),
  color: Joi.string().optional().allow(null).description('Label color identifier'),
});

export const associateLabelSchema = Joi.object({
  chatJid: Joi.string()
    .pattern(/^.+@(s\.whatsapp\.net|g\.us)$/)
    .required()
    .description('JID of the chat to associate (contact or group)'),
});

export const removeAssociationQuerySchema = Joi.object({
  chatJid: Joi.string()
    .pattern(/^.+@(s\.whatsapp\.net|g\.us)$/)
    .required()
    .description('Chat JID to remove association from'),
});
