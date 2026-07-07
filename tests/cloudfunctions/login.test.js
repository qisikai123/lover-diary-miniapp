const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createLoginHandler
} = require('../../cloudfunctions/login/index');

function createMemoryCollection(initialUsers) {
  const rows = (initialUsers || []).map((item) => ({ ...item }));

  return {
    rows,
    where(query) {
      return {
        get() {
          return Promise.resolve({
            data: rows.filter((item) => item.openid === query.openid)
          });
        }
      };
    },
    add({ data }) {
      const _id = data._id || `user-${rows.length + 1}`;
      rows.push({
        ...data,
        _id
      });

      return Promise.resolve({
        _id
      });
    },
    doc(id) {
      return {
        update({ data }) {
          const index = rows.findIndex((item) => item._id === id);

          if (index >= 0) {
            rows[index] = {
              ...rows[index],
              ...data
            };
          }

          return Promise.resolve({
            stats: {
              updated: index >= 0 ? 1 : 0
            }
          });
        }
      };
    }
  };
}

function createMemoryDb(initialUsers) {
  const users = createMemoryCollection(initialUsers);

  return {
    users,
    collection(name) {
      assert.equal(name, 'users');
      return users;
    }
  };
}

test('login cloud function creates a user profile for the current openid', async () => {
  const db = createMemoryDb();
  const handler = createLoginHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 100
  });

  const result = await handler({
    action: 'login',
    payload: {
      nickname: '微信昵称'
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.data.user.openid, 'openid-a');
  assert.equal(result.data.user.nickname, '微信昵称');
  assert.equal(result.data.user.birthDate, '');
  assert.equal(db.users.rows.length, 1);
});

test('login cloud function updates editable user profile fields', async () => {
  const db = createMemoryDb([
    {
      _id: 'user-1',
      openid: 'openid-a',
      nickname: '旧昵称',
      birthDate: '',
      createdAt: 50,
      updatedAt: 50
    }
  ]);
  const handler = createLoginHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 200
  });

  const result = await handler({
    action: 'updateUserProfile',
    payload: {
      nickname: '新昵称',
      birthDate: '2026-07-07'
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.data.user.nickname, '新昵称');
  assert.equal(result.data.user.birthDate, '2026-07-07');
  assert.equal(db.users.rows[0].createdAt, 50);
  assert.equal(db.users.rows[0].updatedAt, 200);
});

test('login cloud function keeps existing profile fields during silent login', async () => {
  const db = createMemoryDb([
    {
      _id: 'user-1',
      openid: 'openid-a',
      nickname: '已保存昵称',
      avatarUrl: 'cloud://avatar-a',
      birthDate: '2026-07-07',
      createdAt: 50,
      updatedAt: 50
    }
  ]);
  const handler = createLoginHandler({
    db,
    getOpenId: () => 'openid-a',
    now: () => 300
  });

  const result = await handler({
    action: 'login',
    payload: {}
  });

  assert.equal(result.success, true);
  assert.equal(result.data.user.nickname, '已保存昵称');
  assert.equal(result.data.user.avatarUrl, 'cloud://avatar-a');
  assert.equal(result.data.user.birthDate, '2026-07-07');
  assert.equal(db.users.rows[0].updatedAt, 300);
});
