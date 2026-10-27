const admin = require('../../services/admin-api'),
  api = require('../../services/api'),
  { pageOptions } = require('../../services/page'),
  painter = require('../../services/atlas');
Page(
  pageOptions(
    {
      data: {
        tab: 'people',
        points: [],
        selectedPoint: 0,
        participants: [],
        history: [],
        snapshot: null,
        previewSide: 'before',
        previewHeight: 180,
        loading: false,
        error: '',
      },
      onShow() {
        if (!admin.session()) return wx.redirectTo({ url: '/pages/admin/index' });
        void this.load();
      },
      async load() {
        this.setData({ loading: true, error: '' });
        try {
          if (admin.session().account.role !== 'owner')
            throw Error('仅顶级管理员可管理收集统计与编辑历史');
          const [atlas, overview, history] = await Promise.all([
            admin.request('/passport'),
            admin.request('/overview'),
            admin.request('/passport/history'),
          ]);
          if (!this.nativeVisible) return;
          this.atlas = atlas.atlas;
          this.setData({ points: overview.points, history: history.items });
          await this.loadPeople();
        } catch (e) {
          this.setData({ error: e.message });
        } finally {
          this.setData({ loading: false });
        }
      },
      tab(e) {
        this.setData({ tab: e.currentTarget.dataset.tab, snapshot: null });
      },
      async point(e) {
        this.setData({ selectedPoint: Number(e.detail.value) });
        await this.loadPeople();
      },
      async loadPeople() {
        const id = this.data.points[this.data.selectedPoint]?.id;
        if (!id) return;
        const result = await admin.request(
          '/passport/point-checkins?pointId=' + encodeURIComponent(id),
        );
        if (this.nativeVisible && this.data.points[this.data.selectedPoint]?.id === id)
          this.setData({ participants: result.items });
      },
      async credit(e) {
        const r = this.data.participants.find((x) => x.userId === e.currentTarget.dataset.id),
          action = e.currentTarget.dataset.action;
        if (!r || this.data.loading) return;
        const answer = await new Promise((resolve) =>
          wx.showModal({
            title: action === 'reset' ? '取消此点位收集统计？' : '恢复原统计？',
            content: r.nickname + '：原始照片与私人留言保留，操作会备份并留审计。',
            success: resolve,
          }),
        );
        if (!answer.confirm) return;
        this.setData({ loading: true, error: '' });
        try {
          await admin.request('/passport/point-checkins', 'POST', {
            pointId: this.data.points[this.data.selectedPoint].id,
            userId: r.userId,
            marker: r.marker,
            action,
          });
          await this.loadPeople();
          wx.showToast({ title: '收集统计已更新', icon: 'success' });
        } catch (error) {
          this.setData({ error: error.message });
        } finally {
          this.setData({ loading: false });
        }
      },
      async preview(e) {
        try {
          const snapshot = await admin.request('/passport/history/' + e.currentTarget.dataset.id);
          if (!this.nativeVisible) return;
          this.setData({ snapshot, previewSide: 'before' });
          wx.nextTick(() => this.drawPreview());
        } catch (error) {
          this.setData({ error: error.message });
        }
      },
      side(e) {
        this.setData({ previewSide: e.currentTarget.dataset.side });
        this.drawPreview();
      },
      closePreview() {
        this.setData({ snapshot: null });
      },
      drawPreview() {
        const snap = this.data.snapshot;
        if (!snap || !this.atlas) return;
        const building = this.atlas.buildings.find((x) => x.id === snap.id);
        if (!building) return;
        const side = this.data.previewSide,
          atlas = {
            ...this.atlas,
            buildings: this.atlas.buildings.map((b) =>
              b.id === building.id ? { ...b, ...snap[side], collected: true } : b,
            ),
          };
        wx.createSelectorQuery()
          .in(this)
          .select('#history-preview')
          .fields({ node: true, size: true })
          .exec((rows) => {
            if (!rows[0] || !this.nativeVisible) return;
            const { node: canvas, width } = rows[0],
              image = canvas.createImage();
            image.onload = () => {
              if (
                this.nativeVisible &&
                this.data.snapshot?.snapshotId === snap.snapshotId &&
                this.data.previewSide === side
              )
                this.setData({
                  previewHeight: painter.draw(
                    canvas,
                    image,
                    atlas,
                    building.frame,
                    width,
                    wx.getWindowInfo().pixelRatio,
                  ),
                });
            };
            image.onerror = () => this.setData({ error: '预览底图加载失败，可切换版本后重试' });
            image.src = api.asset(
              building.frame === 'photo' ? atlas.photoURL : atlas.planURL,
              false,
            );
          });
      },
      async restore() {
        const snap = this.data.snapshot,
          current = this.atlas?.buildings.find((b) => b.id === snap?.id);
        if (!current || this.data.loading) return;
        const answer = await new Promise((resolve) =>
          wx.showModal({
            title: '恢复为修改前版本？',
            content: '当前楼名、关联和轮廓会先备份；其他建筑与用户原始打卡不变。',
            success: resolve,
          }),
        );
        if (!answer.confirm) return;
        this.setData({ loading: true, error: '' });
        try {
          await admin.request('/passport/buildings', 'PUT', {
            id: current.id,
            revision: current.revision,
            restoreFrom: snap.snapshotId,
            checksum: snap.checksum,
          });
          this.setData({ snapshot: null });
          await this.load();
          wx.showToast({ title: '已恢复并备份', icon: 'success' });
        } catch (e) {
          this.setData({ error: e.message });
        } finally {
          this.setData({ loading: false });
        }
      },
    },
    { administrator: true },
  ),
);
