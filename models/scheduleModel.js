const { pool } = require('../config/db');

const SELECT_FIELDS = `
  SELECT id, display_name, day_of_week, TO_CHAR(start_time, 'HH24:MI') AS start_time,
         TO_CHAR(end_time, 'HH24:MI') AS end_time, mode, place, active,
         created_at, updated_at
    FROM schedule_availability
`;

async function listAvailability() {
  const result = await pool.query(
    `${SELECT_FIELDS} ORDER BY day_of_week ASC, start_time ASC, created_at ASC`
  );
  return result.rows;
}

async function createAvailability(slot) {
  const result = await pool.query(
    `INSERT INTO schedule_availability
       (id, display_name, day_of_week, start_time, end_time, mode, place)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, display_name, day_of_week,
       TO_CHAR(start_time, 'HH24:MI') AS start_time,
       TO_CHAR(end_time, 'HH24:MI') AS end_time, mode, place, active,
       created_at, updated_at`,
    [
      slot.id,
      slot.displayName,
      slot.dayOfWeek,
      slot.startTime,
      slot.endTime,
      slot.mode,
      slot.place,
    ]
  );
  return result.rows[0];
}

async function updateAvailability(id, changes) {
  const fields = [];
  const values = [];
  const columnMap = {
    dayOfWeek: 'day_of_week',
    startTime: 'start_time',
    endTime: 'end_time',
    mode: 'mode',
    place: 'place',
    active: 'active',
  };

  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined && columnMap[key]) {
      fields.push(`${columnMap[key]} = $${values.length + 1}`);
      values.push(value);
    }
  }

  if (!fields.length) return null;

  fields.push('updated_at = NOW()');
  values.push(id);
  const result = await pool.query(
    `UPDATE schedule_availability SET ${fields.join(', ')}
       WHERE id = $${values.length}
       RETURNING id, display_name, day_of_week,
         TO_CHAR(start_time, 'HH24:MI') AS start_time,
         TO_CHAR(end_time, 'HH24:MI') AS end_time, mode, place, active,
         created_at, updated_at`,
    values
  );
  return result.rows[0];
}

async function deleteAvailability(id) {
  const result = await pool.query(
    'DELETE FROM schedule_availability WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rows[0];
}

module.exports = {
  listAvailability,
  createAvailability,
  updateAvailability,
  deleteAvailability,
};
