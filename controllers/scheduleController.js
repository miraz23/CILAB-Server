const crypto = require('crypto');
const AppError = require('../utils/appError');
const catchAsync = require('../middleware/catchAsync');
const {
  listAvailability,
  createAvailability,
  updateAvailability,
  deleteAvailability,
} = require('../models/scheduleModel');

const DISPLAY_NAME = 'Md. Khaliluzzaman';
const MODES = new Set(['in-person', 'online']);
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function parseSlotInput(body, partial = false) {
  const input = {
    dayOfWeek: body.dayOfWeek,
    startTime: body.startTime,
    endTime: body.endTime,
    mode: body.mode,
    place: body.place,
  };

  if (!partial || input.dayOfWeek !== undefined) {
    if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
      throw new AppError('Day of week must be an integer from 0 to 6.', 400);
    }
  }
  if (!partial || input.startTime !== undefined) {
    if (typeof input.startTime !== 'string' || !TIME_PATTERN.test(input.startTime) ||
        Number(input.startTime.slice(2)) > 59 || Number(input.startTime.slice(0, 2)) > 23) {
      throw new AppError('Start time must be a valid 24-hour time.', 400);
    }
  }
  if (!partial || input.endTime !== undefined) {
    if (typeof input.endTime !== 'string' || !TIME_PATTERN.test(input.endTime) ||
        Number(input.endTime.slice(2)) > 59 || Number(input.endTime.slice(0, 2)) > 23) {
      throw new AppError('End time must be a valid 24-hour time.', 400);
    }
  }
  if (input.startTime !== undefined && input.endTime !== undefined &&
      input.endTime <= input.startTime) {
    throw new AppError('End time must be later than the start time.', 400);
  }
  if (!partial || input.mode !== undefined) {
    if (!MODES.has(input.mode)) throw new AppError('Mode must be in-person or online.', 400);
  }
  if (!partial || input.place !== undefined) {
    if (typeof input.place !== 'string' || !input.place.trim()) {
      throw new AppError('Place or meeting link is required.', 400);
    }
    input.place = input.place.trim();
  }

  return input;
}

function serializeSlot(slot) {
  return {
    id: slot.id,
    name: slot.display_name,
    dayOfWeek: Number(slot.day_of_week),
    startTime: slot.start_time,
    endTime: slot.end_time,
    mode: slot.mode,
    place: slot.place,
    active: slot.active,
  };
}

exports.list = catchAsync(async (req, res) => {
  const slots = await listAvailability();
  res.json({ success: true, slots: slots.map(serializeSlot) });
});

exports.create = catchAsync(async (req, res, next) => {
  let input;
  try {
    input = parseSlotInput(req.body);
  } catch (error) {
    return next(error);
  }

  const slot = await createAvailability({
    id: crypto.randomUUID(),
    displayName: DISPLAY_NAME,
    ...input,
  });
  res.status(201).json({
    success: true,
    message: 'Availability published.',
    slot: serializeSlot(slot),
  });
});

exports.update = catchAsync(async (req, res, next) => {
  const changes = {};
  try {
    const input = parseSlotInput(req.body, true);
    Object.assign(changes, input);
  } catch (error) {
    return next(error);
  }

  if (req.body.active !== undefined) {
    if (typeof req.body.active !== 'boolean') {
      return next(new AppError('Active must be a boolean.', 400));
    }
    changes.active = req.body.active;
  }

  const slot = await updateAvailability(req.params.id, changes);
  if (!slot) return next(new AppError('Availability not found or no changes provided.', 404));
  res.json({ success: true, message: 'Availability updated.', slot: serializeSlot(slot) });
});

exports.remove = catchAsync(async (req, res, next) => {
  const slot = await deleteAvailability(req.params.id);
  if (!slot) return next(new AppError('Availability not found.', 404));
  res.json({ success: true, message: 'Availability removed.' });
});
