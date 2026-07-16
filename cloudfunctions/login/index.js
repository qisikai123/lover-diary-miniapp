const {
  ALLOWED_USER_OPENIDS,
  NO_PERMISSION_MESSAGE,
  isAllowedOpenId
} = require('../../utils/access-control');

function createLoginHandler({ db, getOpenId, now, allowedOpenIds }) {
  const users = db.collection('users');
  const getCurrentTime = now || (() => Date.now());
  const allowedUserOpenIds = Array.isArray(allowedOpenIds) ? allowedOpenIds : [];

  return async function handleLogin(event) {
    const action = event.action || 'login';
    const payload = event.payload || {};
    const openid = getOpenId();

    if (action === 'login') {
      const existingUser = await findUserByOpenId(users, openid);

      if (!isAllowedOpenId(openid, allowedUserOpenIds)) {
        return failure(NO_PERMISSION_MESSAGE);
      }

      const user = existingUser
        ? await refreshUserOnLogin(users, existingUser, payload, getCurrentTime())
        : await createUser(users, openid, payload, getCurrentTime());

      return success({
        user
      });
    }

    if (action === 'updateUserProfile') {
      const existingUser = await findUserByOpenId(users, openid);

      if (!isAllowedOpenId(openid, allowedUserOpenIds)) {
        return failure(NO_PERMISSION_MESSAGE);
      }

      const user = existingUser
        ? await updateUserProfile(users, existingUser, payload, getCurrentTime())
        : await createUser(users, openid, payload, getCurrentTime());

      return success({
        user
      });
    }

    return {
      success: false,
      message: `未知登录操作：${action}`,
      data: {}
    };
  };
}

exports.main = async (event) => {
  const cloud = require('wx-server-sdk');

  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });

  const handler = createLoginHandler({
    db: cloud.database(),
    getOpenId: () => {
      const context = cloud.getWXContext();

      return context.OPENID;
    },
    now: () => Date.now(),
    allowedOpenIds: ALLOWED_USER_OPENIDS
  });

  return handler(event || {});
};

exports.createLoginHandler = createLoginHandler;

function success(data) {
  return {
    success: true,
    data
  };
}

function failure(message) {
  return {
    success: false,
    message,
    data: {}
  };
}

async function findUserByOpenId(users, openid) {
  const response = await users.where({
    openid
  }).get();
  const list = response.data || [];

  return list[0] || null;
}

async function createUser(users, openid, payload, timestamp) {
  const user = {
    openid,
    ...normalizeUserProfile(payload),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const response = await users.add({
    data: user
  });

  return {
    ...user,
    _id: response._id
  };
}

async function refreshUserOnLogin(users, existingUser, payload, timestamp) {
  const profile = normalizeUserProfile({
    ...existingUser,
    ...pickWechatProfile(payload)
  });
  const data = {
    ...profile,
    updatedAt: timestamp
  };

  await users.doc(existingUser._id).update({
    data
  });

  return {
    ...existingUser,
    ...data
  };
}

async function updateUserProfile(users, existingUser, payload, timestamp) {
  const data = {
    ...normalizeUserProfile(payload),
    updatedAt: timestamp
  };

  await users.doc(existingUser._id).update({
    data
  });

  return {
    ...existingUser,
    ...data
  };
}

function normalizeUserProfile(payload) {
  return {
    nickname: typeof payload.nickname === 'string' && payload.nickname.trim()
      ? payload.nickname.trim()
      : '微信用户',
    avatarUrl: typeof payload.avatarUrl === 'string' ? payload.avatarUrl : '',
    birthDate: typeof payload.birthDate === 'string' ? payload.birthDate : ''
  };
}

function pickWechatProfile(payload) {
  const profile = {};
  const nickname = payload.nickname || payload.nickName;
  const avatarUrl = payload.avatarUrl || payload.avatarURL;

  if (nickname) {
    profile.nickname = nickname;
  }

  if (avatarUrl) {
    profile.avatarUrl = avatarUrl;
  }

  if (typeof payload.birthDate === 'string') {
    profile.birthDate = payload.birthDate;
  }

  return profile;
}
