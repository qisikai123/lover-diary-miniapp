exports.main = async (event) => {
  return {
    success: true,
    action: event.action || 'space',
    payload: event.payload || {},
    data: {}
  };
};
