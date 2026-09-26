/**
 * userService.js
 * Basic user lookup logic.
 */

const USERS = {
  'user-001': { id: 'user-001', name: 'Alice',   type: 'premium' },
  'user-002': { id: 'user-002', name: 'Bob',     type: 'regular' },
  'user-003': { id: 'user-003', name: 'Charlie', type: 'premium' },
};

/**
 * Returns the user with the given id.
 * @param {string} userId
 * @returns {{ id: string, name: string, type: string }}
 */
function getUserById(userId) {
  const user = USERS[userId];
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }
  return user;
}

module.exports = { getUserById };
