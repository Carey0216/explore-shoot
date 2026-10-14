# Three.js 浏览器组件

固定版本：0.180.0。来源：官方 npm 包 https://registry.npmjs.org/three/-/three-0.180.0.tgz 。下载包已按 npm 元数据的 SHA-512 integrity 核对。

使用官方 three.module.min.js、three.core.min.js 和 OrbitControls.js；仅把 OrbitControls 的 three 导入改成本地相对路径。MIT 许可在 LICENSE.txt。按官方浏览器组件保留，不参与项目自身格式化和界面文案提取；建筑生成与业务接口仍由 Java 实现。

v6.5增加同版本官方 `GLTFLoader.js` 与 `BufferGeometryUtils.js`，来源为 [Three.js r180](https://github.com/mrdoob/three.js/tree/r180/examples/jsm)。仅将three和工具导入改成本地相对路径，许可不变；用于读取内嵌纹理的GLB，不加载外部模型地址。
