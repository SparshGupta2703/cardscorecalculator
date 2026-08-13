const roomRepo = require('../repository/roomRepository');

exports.getPublicRooms = (req, res) => {
  const rooms = roomRepo.getAllRooms().map(r => ({
    id: r.id,
    name: r.name,
    playersCount: r.gameState.players.filter(p => p.socketId).length
  }));
  res.json(rooms);
};