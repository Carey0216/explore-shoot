const model = require('../../services/form-model');
Component({
  properties: { fields: Array, administrator: Boolean, busy: Boolean },
  observers: {
    fields: function () {
      this.coordinate();
    },
  },
  data: { uploading: false, error: '' },
  methods: {
    coordinate() {
      const lng = this.data.fields.find((f) => f.key === 'lng'),
        lat = this.data.fields.find((f) => f.key === 'lat');
      if (!lng || !lat) return;
      try {
        const p = require('../../services/coordinates').toTencent({
          lng: Number(lng.value),
          lat: Number(lat.value),
        });
        this.setData({
          mapCoordinate: { longitude: p.lng, latitude: p.lat },
          markers: [
            {
              id: 1,
              longitude: p.lng,
              latitude: p.lat,
              iconPath: '/assets/pin.png',
              width: 22,
              height: 29,
            },
          ],
        });
      } catch (_) {}
    },
    change(e) {
      const path = e.currentTarget.dataset.path;
      this.setData({ [path + '.value']: e.detail.value });
      const key = this.at(path)?.key;
      if (
        (key?.endsWith(':visible') && !e.detail.value) ||
        (key?.endsWith(':enabled') && e.detail.value)
      ) {
        const pair = key.split(':')[0] + (key.endsWith(':visible') ? ':enabled' : ':visible');
        const index = this.data.fields.findIndex((f) => f.key === pair);
        if (index >= 0) this.setData({ ['fields[' + index + '].value']: !!e.detail.value });
      }
      this.coordinate();
      this.triggerEvent('dirty');
    },
    pick(e) {
      const path = e.currentTarget.dataset.path,
        f = this.at(path),
        n = Number(e.detail.value);
      this.setData({ [path + '.selected']: n, [path + '.value']: f.options[n].id });
      this.triggerEvent('dirty');
    },
    multi(e) {
      const path = e.currentTarget.dataset.path,
        f = this.at(path),
        values = e.detail.value;
      this.setData({
        [path + '.value']: values,
        [path + '.options']: f.options.map((o) => ({ ...o, checked: values.includes(o.id) })),
      });
      this.triggerEvent('dirty');
    },
    at(path) {
      return path
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .reduce((o, k) => o?.[k], this.data);
    },
    add(e) {
      const path = e.currentTarget.dataset.path,
        f = this.at(path);
      if (f.max && f.rows.length >= f.max) return;
      this.setData({ [path + '.rows']: [...f.rows, { fields: model.fields(f.schema, {}) }] });
      this.triggerEvent('dirty');
    },
    remove(e) {
      const path = e.currentTarget.dataset.path,
        f = this.at(path),
        rows = f.rows.slice();
      rows.splice(Number(e.currentTarget.dataset.index), 1);
      this.setData({ [path + '.rows']: rows });
      this.triggerEvent('dirty');
    },
    move(e) {
      const path = e.currentTarget.dataset.path,
        f = this.at(path),
        rows = f.rows.slice(),
        from = Number(e.currentTarget.dataset.index),
        to = from + Number(e.currentTarget.dataset.delta);
      if (to < 0 || to >= rows.length) return;
      rows.splice(to, 0, rows.splice(from, 1)[0]);
      this.setData({ [path + '.rows']: rows });
      this.triggerEvent('dirty');
    },
    read() {
      return model.serialize(this.data.fields);
    },
    async photo(e) {
      if (this.data.uploading) return;
      const path = e.currentTarget.dataset.path,
        api = require(this.data.administrator ? '../../services/admin-api' : '../../services/api'),
        owner = api.session()?.account.id;
      this.setData({ uploading: true, error: '' });
      try {
        const photo = require('../../services/photo'),
          src = await photo.choose(),
          canvas = await new Promise((resolve) =>
            this.createSelectorQuery()
              .select('#form-photo')
              .fields({ node: true })
              .exec((r) => resolve(r[0]?.node)),
          ),
          file = await photo.compress(src, canvas),
          data = await photo.dataURL(file);
        if (owner !== api.session()?.account.id) return;
        const r = await api.request(this.data.administrator ? '/media' : '/api/media', 'POST', {
          photo: data,
        });
        if (owner === api.session()?.account.id) {
          this.setData({ [path + '.value']: r.id, [path + '.preview']: file });
          this.triggerEvent('dirty');
        }
      } catch (e) {
        if (!/cancel/.test(e.errMsg || '')) this.setData({ error: e.message || '图片处理失败' });
      } finally {
        this.setData({ uploading: false });
      }
    },
    clearPhoto(e) {
      this.setData({
        [e.currentTarget.dataset.path + '.value']: null,
        [e.currentTarget.dataset.path + '.preview']: '',
      });
      this.triggerEvent('dirty');
    },
    location(e) {
      const path = e.currentTarget.dataset.path;
      wx.chooseLocation({
        success: (r) => {
          const f = this.at(path);
          const pair = require('../../services/coordinates').fromTencent({
            lat: r.latitude,
            lng: r.longitude,
          });
          this.setData({ [path + '.value']: pair.lng });
          const index = this.data.fields.findIndex((f) => f.key === 'lat');
          if (index >= 0) this.setData({ ['fields[' + index + '].value']: pair.lat });
          this.triggerEvent('dirty');
        },
        fail: (e) => {
          if (!/cancel/.test(e.errMsg || ''))
            this.setData({ error: '无法选择位置，请手动填写并核对经纬度' });
        },
      });
    },
  },
});
