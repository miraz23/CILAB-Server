const catchAsync = require('../middleware/catchAsync');
const { getPublicStats } = require('../models/publicStatsModel');

exports.get = catchAsync(async (req, res) => {
  res.json({
    success: true,
    stats: await getPublicStats(),
  });
});
