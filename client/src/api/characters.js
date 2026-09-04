import { api } from './client.js';

export const listCharacters = (params = {}) => api.get('/characters', { query: params });
export const createCharacter = (body) => api.post('/characters', body);
export const updateCharacter = (characterId, patch) => api.patch(`/characters/${characterId}`, patch);
export const deleteCharacter = (characterId) => api.delete(`/characters/${characterId}`);

export const lockIdentity = (characterId) => api.post(`/characters/${characterId}/lock`, {});
export const unlockIdentity = (characterId) => api.post(`/characters/${characterId}/unlock`, {});

export const addReference = (characterId, assetId) =>
  api.post(`/characters/${characterId}/references`, { assetId });

export const removeReference = (characterId, assetId) =>
  api.delete(`/characters/${characterId}/references/${assetId}`);

export const attachToBook = (bookId, characterId) =>
  api.post(`/books/${bookId}/characters`, { characterId });
export const detachFromBook = (bookId, characterId) =>
  api.delete(`/books/${bookId}/characters/${characterId}`);

export default {
  addReference,
  removeReference,
  listCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  lockIdentity,
  unlockIdentity,
  attachToBook,
  detachFromBook,
};
