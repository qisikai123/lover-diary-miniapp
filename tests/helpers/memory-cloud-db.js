function createMemoryCollection(initialRows, idPrefix) {
  const rows = (initialRows || []).map((item) => ({ ...item }));

  return {
    rows,
    get() {
      return Promise.resolve({
        data: rows.slice()
      });
    },
    where(query) {
      return {
        get() {
          return Promise.resolve({
            data: rows.filter((item) => matchesQuery(item, query))
          });
        },
        update({ data }) {
          let updated = 0;

          rows.forEach((item, index) => {
            if (!matchesQuery(item, query)) {
              return;
            }

            rows[index] = {
              ...item,
              ...data
            };
            updated += 1;
          });

          return Promise.resolve({
            stats: {
              updated
            }
          });
        }
      };
    },
    add({ data }) {
      const _id = data._id || `${idPrefix}-${rows.length + 1}`;
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
        get() {
          return Promise.resolve({
            data: rows.find((item) => item._id === id) || null
          });
        },
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
        },
        remove() {
          const index = rows.findIndex((item) => item._id === id);

          if (index >= 0) {
            rows.splice(index, 1);
          }

          return Promise.resolve({
            stats: {
              removed: index >= 0 ? 1 : 0
            }
          });
        }
      };
    }
  };
}

/**
 * 创建可用于云函数单元测试的内存数据库。
 *
 * 支持审核任务的条件更新，用于验证异步回调只允许一个执行者完成最终发布。
 *
 * @param {Array<Object>} initialRecords
 * @param {Array<Object>} initialUsers
 * @param {Array<Object>} initialTasks
 * @param {Array<Object>} initialChecks
 * @returns {Object}
 */
function createMemoryDb(initialRecords, initialUsers, initialTasks, initialChecks) {
  const collections = {
    records: createMemoryCollection(initialRecords, 'record'),
    users: createMemoryCollection(initialUsers, 'user'),
    content_security_tasks: createMemoryCollection(initialTasks, 'review'),
    content_security_checks: createMemoryCollection(initialChecks, 'check')
  };

  return {
    records: collections.records,
    users: collections.users,
    contentSecurityTasks: collections.content_security_tasks,
    contentSecurityChecks: collections.content_security_checks,
    collection(name) {
      const collection = collections[name];

      if (!collection) {
        throw new Error(`unexpected collection ${name}`);
      }

      return collection;
    }
  };
}

function matchesQuery(item, query) {
  return Object.keys(query).every((key) => {
    const values = readPathValues(item, key.split('.'));

    return values.some((value) => value === query[key]);
  });
}

function readPathValues(value, path) {
  if (!path.length) {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => readPathValues(item, path));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const [key, ...remainingPath] = path;

  return readPathValues(value[key], remainingPath);
}

module.exports = {
  createMemoryDb
};
