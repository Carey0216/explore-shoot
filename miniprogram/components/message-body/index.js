Component({
  properties: { value: Object, administrator: Boolean },
  methods: {
    link(e) {
      this.triggerEvent('navigate');
      require('../../services/links').open(e.currentTarget.dataset.href);
    },
  },
});
