import { getSessionById } from '../../db/repositories/sessions.js';
import {
  upsertLabels,
  getLabelsBySession,
  associateLabelWithChat,
  removeLabelFromChat,
} from '../../db/repositories/labels.js';

export async function listLabelsController(req, res, next) {
  try {
    const { id: sessionId } = req.params;
    const session = await getSessionById(sessionId);

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const labels = await getLabelsBySession(sessionId);

    res.json({
      success: true,
      data: labels,
    });
  } catch (err) {
    next(err);
  }
}

export async function upsertLabelController(req, res, next) {
  try {
    const { id: sessionId } = req.params;
    const { labelId, name, color } = req.body;

    const session = await getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const [label] = await upsertLabels(sessionId, [
      {
        id: labelId,
        name,
        color,
      },
    ]);

    res.status(201).json({
      success: true,
      data: {
        id: label.id,
        labelId: label.label_id,
        name: label.name,
        color: label.color,
        metadata: label.metadata,
        created_at: label.created_at,
        updated_at: label.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function associateLabelController(req, res, next) {
  try {
    const { id: sessionId, labelId } = req.params;
    const { chatJid } = req.body;

    const session = await getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const association = await associateLabelWithChat(sessionId, chatJid, { id: labelId });
    if (!association) {
      return res.status(400).json({
        success: false,
        message: 'Unable to associate label. Ensure chat and label exist.',
      });
    }

    res.status(201).json({
      success: true,
      data: {
        labelId,
        chatJid,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function removeLabelAssociationController(req, res, next) {
  try {
    const { id: sessionId, labelId } = req.params;
    const { chatJid } = req.query;

    if (!chatJid) {
      return res.status(400).json({
        success: false,
        message: 'chatJid query parameter is required',
      });
    }

    const session = await getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const removed = await removeLabelFromChat(sessionId, chatJid, labelId);

    if (!removed) {
      return res.status(404).json({
        success: false,
        message: 'Association not found for provided chat/label',
      });
    }

    res.json({
      success: true,
      data: {
        labelId,
        chatJid,
      },
    });
  } catch (err) {
    next(err);
  }
}

export default {
  listLabelsController,
  upsertLabelController,
  associateLabelController,
  removeLabelAssociationController,
};
