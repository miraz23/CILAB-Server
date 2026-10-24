const crypto = require('crypto');
const AppError = require('../utils/appError');
const catchAsync = require('../middleware/catchAsync');
const {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} = require('../models/announcementModel');

const KINDS = new Set(['announcement', 'notice', 'seminar']);
const AUDIENCES = new Set(['all', 'students', 'faculty', 'admins']);
const PRIORITIES = new Set(['normal', 'important', 'urgent']);
const STATUSES = new Set(['draft', 'published', 'archived']);

function parseInput(body, partial = false) {
  const input = {
    kind: body.kind !== undefined ? body.kind : (partial ? undefined : 'announcement'),
    title: body.title,
    body: body.body,
    audience: body.audience,
    priority: body.priority,
    pinned: body.pinned,
    publishAt: body.publishAt,
    eventAt: body.eventAt,
    venue: body.venue,
    poster: body.poster,
    extraFields: body.extraFields,
  };

  if (!partial || input.kind !== undefined) {
    if (!KINDS.has(input.kind)) throw new AppError('Invalid announcement type.', 400);
  }
  if (!partial || input.title !== undefined) {
    if (typeof input.title !== 'string' || input.title.trim().length < 6) {
      throw new AppError('Title must be at least 6 characters.', 400);
    }
    input.title = input.title.trim();
  }
  if (!partial || input.body !== undefined) {
    if (typeof input.body !== 'string' || input.body.trim().length < 20) {
      throw new AppError('Body must be at least 20 characters.', 400);
    }
    input.body = input.body.trim();
  }
  if (!partial && input.audience === undefined) input.audience = 'all';
  if (!partial && input.priority === undefined) input.priority = 'normal';
  if (!partial || input.audience !== undefined) {
    if (!AUDIENCES.has(input.audience)) throw new AppError('Invalid announcement audience.', 400);
  }
  if (!partial || input.priority !== undefined) {
    if (!PRIORITIES.has(input.priority)) throw new AppError('Invalid announcement priority.', 400);
  }
  if (!partial || input.pinned !== undefined) {
    if (typeof input.pinned !== 'boolean') throw new AppError('Pinned must be a boolean.', 400);
  }
  if (input.publishAt !== undefined && input.publishAt !== '') {
    if (typeof input.publishAt !== 'string' || Number.isNaN(Date.parse(input.publishAt))) {
      throw new AppError('Publish date must be a valid date.', 400);
    }
    input.publishAt = new Date(input.publishAt).toISOString();
  }
  for (const field of ['eventAt']) {
    if (input[field] !== undefined && input[field] !== '') {
      if (typeof input[field] !== 'string' || Number.isNaN(Date.parse(input[field]))) {
        throw new AppError('Event date must be a valid date.', 400);
      }
      input[field] = new Date(input[field]).toISOString();
    }
  }
  if (input.venue !== undefined && input.venue !== '' && typeof input.venue !== 'string') {
    throw new AppError('Venue must be text.', 400);
  }
  if (input.poster !== undefined && input.poster !== '' && typeof input.poster !== 'string') {
    throw new AppError('Poster must be text.', 400);
  }
  if (input.extraFields !== undefined && !Array.isArray(input.extraFields)) {
    throw new AppError('Extra fields must be an array.', 400);
  }
  return input;
}

function serializeAnnouncement(announcement) {
  return {
    id: announcement.id,
    kind: announcement.kind,
    title: announcement.title,
    body: announcement.body,
    audience: announcement.audience,
    priority: announcement.priority,
    status: announcement.status,
    pinned: announcement.pinned,
    publishAt: announcement.publish_at || undefined,
    eventAt: announcement.event_at || undefined,
    venue: announcement.venue || undefined,
    poster: announcement.poster || undefined,
    extraFields: announcement.extra_fields || [],
    createdAt: announcement.created_at,
    updatedAt: announcement.updated_at,
    author: { id: announcement.author_id, name: announcement.author_name },
  };
}

exports.list = catchAsync(async (req, res) => {
  const status = req.query.status && req.query.status !== 'all' ? req.query.status : undefined;
  const audience = req.query.audience && req.query.audience !== 'all' ? req.query.audience : undefined;
  const kind = req.query.kind && req.query.kind !== 'all' ? req.query.kind : undefined;
  if (status && !STATUSES.has(status)) throw new AppError('Invalid announcement status.', 400);
  if (audience && !AUDIENCES.has(audience)) throw new AppError('Invalid announcement audience.', 400);
  if (kind && !KINDS.has(kind)) throw new AppError('Invalid announcement type.', 400);
  const announcements = await listAnnouncements({
    status,
    kind,
    audience,
    search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
  });

  res.json({
    success: true,
    announcements: announcements.map(serializeAnnouncement),
    total: announcements.length,
  });
});

exports.publicList = catchAsync(async (req, res) => {
  const announcements = await listAnnouncements({ status: 'published', publishedNow: true });
  res.json({
    success: true,
    announcements: announcements.map(serializeAnnouncement),
    total: announcements.length,
  });
});

exports.upsert = catchAsync(async (req, res, next) => {
  const { intent, announcementId } = req.body;
  const targetId = req.params.id || announcementId;
  if (!STATUSES.has(intent)) return next(new AppError('A valid announcement status is required.', 400));

  let input;
  try {
    input = parseInput(req.body, Boolean(targetId));
  } catch (error) {
    return next(error);
  }
  input.status = intent;

  const announcement = targetId
    ? await updateAnnouncement(targetId, input)
    : await createAnnouncement({
      id: crypto.randomUUID(),
      ...input,
      authorId: req.user.id,
    });
  if (!announcement) return next(new AppError('Announcement not found or no changes provided.', 404));

  res.status(targetId ? 200 : 201).json({
    success: true,
    message: targetId ? 'Announcement updated.' : 'Announcement created.',
    announcement: serializeAnnouncement(announcement),
  });
});

exports.remove = catchAsync(async (req, res, next) => {
  const announcement = await deleteAnnouncement(req.params.id);
  if (!announcement) return next(new AppError('Announcement not found.', 404));
  res.json({ success: true, message: 'Announcement removed.' });
});
