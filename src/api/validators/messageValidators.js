import Joi from 'joi';

/**
 * Message Validators
 * Joi schemas for validating message requests across different message types
 */

/**
 * Base schema for all messages
 */
const baseMessageSchema = {
  messageId: Joi.string()
    .trim()
    .min(1)
    .max(255)
    .required()
    .description('Unique idempotency key for this message. Prevents duplicate sends.'),

  to: Joi.string()
    .trim()
    .pattern(/^([0-9\-]+@(s\.whatsapp\.net|g\.us)|status@broadcast)$/)
    .required()
    .description('Recipient JID (e.g., 5511999999999@s.whatsapp.net for individual, 123456@g.us for group, status@broadcast for story)'),

  statusJidList: Joi.array()
    .items(Joi.string().pattern(/^[0-9\-]+@s\.whatsapp\.net$/))
    .optional()
    .description('Array of JIDs that can view this status (only for status@broadcast)'),

  metadata: Joi.object({
    reference: Joi.string().max(255).optional().description('External reference ID'),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional().description('Tags for categorization'),
    custom: Joi.object().optional().description('Custom metadata (free-form object)'),
  })
    .optional()
    .description('Optional metadata for tracking and categorization'),
};

/**
 * Text message schema
 */
const textMessageSchema = Joi.object({
  type: Joi.string().valid('text').required(),
  text: Joi.string()
    .trim()
    .min(1)
    .max(65536) // WhatsApp max message length
    .required()
    .description('Text content of the message'),
});

/**
 * Image message schema
 */
const imageMessageSchema = Joi.object({
  type: Joi.string().valid('image').required(),
  image: Joi.object({
    url: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required()
      .description('URL of the image to send'),
    caption: Joi.string().max(1024).optional().allow('').description('Optional caption'),
    mimeType: Joi.string()
      .valid('image/jpeg', 'image/png', 'image/webp', 'image/gif')
      .optional()
      .description('MIME type of the image'),
  }).required(),
});

/**
 * Video message schema
 */
const videoMessageSchema = Joi.object({
  type: Joi.string().valid('video').required(),
  video: Joi.object({
    url: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required()
      .description('URL of the video to send'),
    caption: Joi.string().max(1024).optional().allow('').description('Optional caption'),
    mimeType: Joi.string()
      .valid('video/mp4', 'video/3gpp', 'video/quicktime')
      .optional()
      .description('MIME type of the video'),
    gifPlayback: Joi.boolean().optional().description('Whether to play as GIF (no sound)'),
  }).required(),
});

/**
 * Audio message schema
 */
const audioMessageSchema = Joi.object({
  type: Joi.string().valid('audio').required(),
  audio: Joi.object({
    url: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required()
      .description('URL of the audio to send'),
    mimeType: Joi.string()
      .valid('audio/mpeg', 'audio/ogg; codecs=opus', 'audio/mp4', 'audio/aac')
      .optional()
      .description('MIME type of the audio'),
    ptt: Joi.boolean()
      .default(false)
      .description('Whether to send as PTT (Push-to-Talk) voice message'),
  }).required(),
});

/**
 * Document message schema
 */
const documentMessageSchema = Joi.object({
  type: Joi.string().valid('document').required(),
  document: Joi.object({
    url: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required()
      .description('URL of the document to send'),
    // fileName is optional now; controller will derive a sensible fallback if not provided
    fileName: Joi.string().max(255).optional().description('File name with extension'),
    caption: Joi.string().max(1024).optional().allow('').description('Optional caption'),
    mimeType: Joi.string()
      .optional()
      .description('MIME type (e.g., application/pdf, application/vnd.ms-excel)'),
  }).required(),
});

/**
 * Location message schema
 */
const locationMessageSchema = Joi.object({
  type: Joi.string().valid('location').required(),
  location: Joi.object({
    latitude: Joi.number().min(-90).max(90).required().description('Latitude coordinate'),
    longitude: Joi.number().min(-180).max(180).required().description('Longitude coordinate'),
    name: Joi.string().max(255).optional().description('Location name/title'),
    address: Joi.string().max(512).optional().description('Location address'),
  }).required(),
});

/**
 * Contact message schema
 */
const contactMessageSchema = Joi.object({
  type: Joi.string().valid('contact').required(),
  contact: Joi.object({
    displayName: Joi.string().max(255).required().description('Contact display name'),
    vcard: Joi.string().required().description('vCard string (VCF format)'),
  }).required(),
});

/**
 * Reaction message schema
 */
const reactionMessageSchema = Joi.object({
  type: Joi.string().valid('reaction').required(),
  reaction: Joi.object({
    messageId: Joi.string().required().description('WhatsApp message ID to react to'),
    emoji: Joi.string()
      .max(10)
      .required()
      .description('Emoji to react with (or empty string to remove reaction)'),
  }).required(),
});

/**
 * Template message schema (for business API)
 */
const templateMessageSchema = Joi.object({
  type: Joi.string().valid('template').required(),
  template: Joi.object({
    name: Joi.string().required().description('Template name'),
    languageCode: Joi.string().default('en').description('Language code (e.g., en, pt_BR)'),
    components: Joi.array()
      .items(
        Joi.object({
          type: Joi.string().valid('header', 'body', 'button').required(),
          parameters: Joi.array().items(Joi.object()).optional(),
        })
      )
      .optional()
      .description('Template components with parameters'),
  }).required(),
});

/**
 * Combined message content schema (validates based on type)
 */
const messageContentSchema = Joi.alternatives()
  .try(
    textMessageSchema,
    imageMessageSchema,
    videoMessageSchema,
    audioMessageSchema,
    documentMessageSchema,
    locationMessageSchema,
    contactMessageSchema,
    reactionMessageSchema,
    templateMessageSchema
  )
  .required();

/**
 * Main send message schema
 * Combines base fields with message content
 */
export const sendMessageSchema = Joi.object({
  messageId: Joi.string().required()
    .description('Unique client-side message ID for idempotency'),
  to: Joi.string().required()
    .pattern(/^([0-9\-]+@(s\.whatsapp\.net|g\.us)|status@broadcast)$/)
    .description('Recipient JID (phone: 5511999999999@s.whatsapp.net, group: 123456-789@g.us, status: status@broadcast)'),
  type: Joi.string().required()
    .valid('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'reaction', 'template')
    .description('Type of message to send'),
  
  // Optional fields
  text: Joi.string().when('type', { is: 'text', then: Joi.required() }),
  image: Joi.object({
    url: Joi.string().uri().required(),
    caption: Joi.string().optional(),
  }).when('type', { is: 'image', then: Joi.required() }),
  video: Joi.object({
    url: Joi.string().uri().required(),
    caption: Joi.string().optional(),
    gifPlayback: Joi.boolean().optional(),
  }).when('type', { is: 'video', then: Joi.required() }),
  audio: Joi.object({
    url: Joi.string().uri().required(),
    ptt: Joi.boolean().optional().default(true),
  }).when('type', { is: 'audio', then: Joi.required() }),
  document: Joi.object({
    url: Joi.string().uri().required(),
    fileName: Joi.string().optional(),
    mimetype: Joi.string().optional(),
  }).when('type', { is: 'document', then: Joi.required() }),
  location: Joi.object({
    latitude: Joi.number().required(),
    longitude: Joi.number().required(),
    name: Joi.string().optional(),
  }).when('type', { is: 'location', then: Joi.required() }),
  contact: Joi.object({
    displayName: Joi.string().required(),
    vcard: Joi.string().required(),
  }).when('type', { is: 'contact', then: Joi.required() }),
  reaction: Joi.object({
    messageId: Joi.string().required(),
    emoji: Joi.string().required(),
  }).when('type', { is: 'reaction', then: Joi.required() }),
  template: Joi.object({
    name: Joi.string().required(),
    language: Joi.string().required(),
    components: Joi.array().optional(),
  }).when('type', { is: 'template', then: Joi.required() }),
  
  statusJidList: Joi.array()
    .items(Joi.string().pattern(/^[0-9\-]+@s\.whatsapp\.net$/))
    .optional()
    .description('Array of JIDs that can view this status (only for status@broadcast)'),
  
  metadata: Joi.object().optional()
    .description('Custom metadata to store with the message'),
}).unknown(false)

/**
 * Alternative: Use when() for conditional validation
 */
export const sendMessageSchemaAlternative = Joi.object({
  messageId: baseMessageSchema.messageId,
  to: baseMessageSchema.to,
  metadata: baseMessageSchema.metadata,
  type: Joi.string()
    .valid('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'reaction', 'template')
    .required(),
})
  .when(Joi.object({ type: 'text' }).unknown(), {
    then: textMessageSchema,
  })
  .when(Joi.object({ type: 'image' }).unknown(), {
    then: imageMessageSchema,
  })
  .when(Joi.object({ type: 'video' }).unknown(), {
    then: videoMessageSchema,
  })
  .when(Joi.object({ type: 'audio' }).unknown(), {
    then: audioMessageSchema,
  })
  .when(Joi.object({ type: 'document' }).unknown(), {
    then: documentMessageSchema,
  })
  .when(Joi.object({ type: 'location' }).unknown(), {
    then: locationMessageSchema,
  })
  .when(Joi.object({ type: 'contact' }).unknown(), {
    then: contactMessageSchema,
  })
  .when(Joi.object({ type: 'reaction' }).unknown(), {
    then: reactionMessageSchema,
  })
  .when(Joi.object({ type: 'template' }).unknown(), {
    then: templateMessageSchema,
  });

/**
 * Simpler approach: Validate the entire request body
 * This is the recommended approach for this use case
 */
export const sendMessageSchemaSimple = Joi.object({
  messageId: baseMessageSchema.messageId,
  to: baseMessageSchema.to,
  metadata: baseMessageSchema.metadata,
  type: Joi.string()
    .valid('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'reaction', 'template')
    .required()
    .description('Type of message to send'),

  // Text
  text: Joi.when('type', {
    is: 'text',
    then: Joi.string().trim().min(1).max(65536).required(),
    otherwise: Joi.forbidden(),
  }),

  // Image
  image: Joi.when('type', {
    is: 'image',
    then: Joi.object({
      url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
      caption: Joi.string().max(1024).optional().allow(''),
      mimeType: Joi.string().valid('image/jpeg', 'image/png', 'image/webp', 'image/gif').optional(),
    }).required(),
    otherwise: Joi.forbidden(),
  }),

  // Video
  video: Joi.when('type', {
    is: 'video',
    then: Joi.object({
      url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
      caption: Joi.string().max(1024).optional().allow(''),
      mimeType: Joi.string().valid('video/mp4', 'video/3gpp', 'video/quicktime').optional(),
      gifPlayback: Joi.boolean().optional(),
    }).required(),
    otherwise: Joi.forbidden(),
  }),

  // Audio
  audio: Joi.when('type', {
    is: 'audio',
    then: Joi.object({
      url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
      mimeType: Joi.string().valid('audio/mpeg', 'audio/ogg; codecs=opus', 'audio/mp4', 'audio/aac').optional(),
      ptt: Joi.boolean().default(false),
    }).required(),
    otherwise: Joi.forbidden(),
  }),

  // Document
  document: Joi.when('type', {
    is: 'document',
    then: Joi.object({
      url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
      // Allow clients to omit fileName; the server will provide a fallback filename
      fileName: Joi.string().max(255).optional(),
      caption: Joi.string().max(1024).optional().allow(''),
      mimeType: Joi.string().optional(),
    }).required(),
    otherwise: Joi.forbidden(),
  }),

  // Location
  location: Joi.when('type', {
    is: 'location',
    then: Joi.object({
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required(),
      name: Joi.string().max(255).optional(),
      address: Joi.string().max(512).optional(),
    }).required(),
    otherwise: Joi.forbidden(),
  }),

  // Contact
  contact: Joi.when('type', {
    is: 'contact',
    then: Joi.object({
      displayName: Joi.string().max(255).required(),
      vcard: Joi.string().required(),
    }).required(),
    otherwise: Joi.forbidden(),
  }),

  // Reaction
  reaction: Joi.when('type', {
    is: 'reaction',
    then: Joi.object({
      messageId: Joi.string().required(),
      emoji: Joi.string().max(10).allow('').required(),
    }).required(),
    otherwise: Joi.forbidden(),
  }),

  // Template
  template: Joi.when('type', {
    is: 'template',
    then: Joi.object({
      name: Joi.string().required(),
      languageCode: Joi.string().default('en'),
      components: Joi.array()
        .items(
          Joi.object({
            type: Joi.string().valid('header', 'body', 'button').required(),
            parameters: Joi.array().items(Joi.object()).optional(),
          })
        )
        .optional(),
    }).required(),
    otherwise: Joi.forbidden(),
  }),
});

/**
 * Query parameters for listing messages
 */
export const listMessagesSchema = Joi.object({
  status: Joi.string()
    .valid('queued', 'processing', 'sent', 'delivered', 'read', 'failed', 'dlq')
    .optional()
    .description('Filter by message status'),

  direction: Joi.string()
    .valid('inbound', 'outbound')
    .optional()
    .description('Filter by message direction'),

  type: Joi.string()
    .valid('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'reaction', 'template')
    .optional()
    .description('Filter by message type'),

  limit: Joi.number().integer().min(1).max(100).default(50).optional(),
  offset: Joi.number().integer().min(0).default(0).optional(),

  sortBy: Joi.string()
    .valid('created_at', 'queued_at', 'sent_at', 'delivered_at')
    .default('created_at')
    .optional(),

  sortOrder: Joi.string().valid('asc', 'desc').default('desc').optional(),
});

/**
 * Message ID parameter schema
 */
export const messageIdSchema = Joi.object({
  messageId: Joi.string()
    .uuid()
    .required()
    .description('Database message ID (UUID)'),
});

export default {
  sendMessageSchema: sendMessageSchemaSimple,
  listMessagesSchema,
  messageIdSchema,
};
