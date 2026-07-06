exports.main = async (event) => {
  return {
    success: true,
    action: event.action || 'login',
    payload: event.payload || {},
    data: {}
  };
};
