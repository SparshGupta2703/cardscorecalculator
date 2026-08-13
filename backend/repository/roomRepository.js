const rooms = {};

module.exports = {
  createRoom: (roomId, roomData) => {
    rooms[roomId] = roomData;
    return rooms[roomId];
  },
  getRoom: (roomId) => {
    return rooms[roomId];
  },
  getAllRooms: () => {
    return Object.values(rooms);
  },
  deleteRoom: (roomId) => {
    delete rooms[roomId];
  }
};