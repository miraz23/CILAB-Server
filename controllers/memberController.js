const catchAsync = require('../middleware/catchAsync');
const { findPublicMembers } = require('../models/userModel');

function serializeMember(member) {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    scholarId: member.scholar_id,
    institution: member.institution,
    academicRole: member.role,
    joinedAt: member.created_at,
  };
}

exports.list = catchAsync(async (req, res) => {
  const members = await findPublicMembers();
  res.json({
    success: true,
    message: 'Members loaded.',
    members: members.map(serializeMember),
  });
});
