const { pool } = require('../config/db');

async function getPlatformStats() {
  const [
    userCounts,
    activity,
    roleBreakdown,
    moderation,
    metricCounts,
  ] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (
          WHERE status = 'active'
            AND last_active_at >= CURRENT_DATE - INTERVAL '30 days'
        )::int AS active_users,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_users,
        COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended_users
      FROM users
    `),
    pool.query(`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - INTERVAL '6 months',
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        ) AS month
      )
      SELECT
        TO_CHAR(months.month, 'Mon') AS label,
        COUNT(u.id) FILTER (WHERE u.created_at >= months.month
          AND u.created_at < months.month + INTERVAL '1 month')::int AS uploads,
        COUNT(u.id) FILTER (WHERE u.status = 'approved'
          AND u.reviewed_at >= months.month
          AND u.reviewed_at < months.month + INTERVAL '1 month')::int AS approvals,
        (SELECT COUNT(*) FROM access_requests ar
          WHERE ar.created_at >= months.month
            AND ar.created_at < months.month + INTERVAL '1 month')::int AS access_requests,
        (SELECT COUNT(*) FROM schedule_availability sa
          WHERE sa.created_at >= months.month
            AND sa.created_at < months.month + INTERVAL '1 month')::int AS meetings
      FROM months
      LEFT JOIN uploads u ON u.created_at >= months.month
        AND u.created_at < months.month + INTERVAL '1 month'
      GROUP BY months.month
      ORDER BY months.month
    `),
    pool.query(`
      SELECT COALESCE(NULLIF(TRIM(role), ''), 'Other') AS academic_role,
             COUNT(*)::int AS users
        FROM users
       GROUP BY COALESCE(NULLIF(TRIM(role), ''), 'Other')
       ORDER BY users DESC, academic_role ASC
    `),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (
          WHERE status = 'approved'
            AND reviewed_at >= CURRENT_DATE - INTERVAL '7 days'
        )::int AS approved_this_week,
        COUNT(*) FILTER (
          WHERE status = 'rejected'
            AND reviewed_at >= CURRENT_DATE - INTERVAL '7 days'
        )::int AS rejected_this_week,
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600)
            FILTER (WHERE reviewed_at IS NOT NULL),
          0
        )::numeric(10, 1) AS average_review_hours
      FROM uploads
    `),
    pool.query(`
      WITH periods AS (
        SELECT
          COUNT(*) FILTER (WHERE upload_type = 'paper'
            AND created_at >= CURRENT_DATE - INTERVAL '30 days')::int AS papers_current,
          COUNT(*) FILTER (WHERE upload_type = 'paper'
            AND created_at >= CURRENT_DATE - INTERVAL '60 days'
            AND created_at < CURRENT_DATE - INTERVAL '30 days')::int AS papers_previous,
          COUNT(*) FILTER (WHERE upload_type = 'presentation'
            AND created_at >= CURRENT_DATE - INTERVAL '30 days')::int AS presentations_current,
          COUNT(*) FILTER (WHERE upload_type = 'presentation'
            AND created_at >= CURRENT_DATE - INTERVAL '60 days'
            AND created_at < CURRENT_DATE - INTERVAL '30 days')::int AS presentations_previous
        FROM uploads
      ),
      access_periods AS (
        SELECT
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::int AS access_current,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '60 days'
            AND created_at < CURRENT_DATE - INTERVAL '30 days')::int AS access_previous
        FROM access_requests
      ),
      meeting_periods AS (
        SELECT
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::int AS meetings_current,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '60 days'
            AND created_at < CURRENT_DATE - INTERVAL '30 days')::int AS meetings_previous
        FROM schedule_availability
      )
      SELECT * FROM periods, access_periods, meeting_periods
    `),
  ]);

  const counts = userCounts.rows[0];
  const metrics = metricCounts.rows[0];

  return {
    totalUsers: counts.total_users,
    activeUsers: counts.active_users,
    pendingUsers: counts.pending_users,
    suspendedUsers: counts.suspended_users,
    metrics: [
      {
        id: 'papers',
        label: 'Papers Archived',
        value: metrics.papers_current,
        delta: calculateDelta(metrics.papers_current, metrics.papers_previous),
      },
      {
        id: 'presentations',
        label: 'Presentations Archived',
        value: metrics.presentations_current,
        delta: calculateDelta(metrics.presentations_current, metrics.presentations_previous),
      },
      {
        id: 'access-requests',
        label: 'Access Requests',
        value: metrics.access_current,
        delta: calculateDelta(metrics.access_current, metrics.access_previous),
      },
      {
        id: 'meetings',
        label: 'Availability Slots',
        value: metrics.meetings_current,
        delta: calculateDelta(metrics.meetings_current, metrics.meetings_previous),
      },
    ],
    activity: activity.rows.map((point) => ({
      label: point.label,
      uploads: point.uploads,
      approvals: point.approvals,
      accessRequests: point.access_requests,
      meetings: point.meetings,
    })),
    roleBreakdown: roleBreakdown.rows.map((entry) => ({
      academicRole: entry.academic_role,
      users: entry.users,
    })),
    moderation: {
      pending: moderation.rows[0].pending,
      approvedThisWeek: moderation.rows[0].approved_this_week,
      rejectedThisWeek: moderation.rows[0].rejected_this_week,
      averageReviewHours: Number(moderation.rows[0].average_review_hours),
    },
    generatedAt: new Date().toISOString(),
  };
}

function calculateDelta(current, previous) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

module.exports = { getPlatformStats };
