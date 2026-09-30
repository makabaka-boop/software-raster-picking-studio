# Canvas Triangle Viewer

一个不依赖 WebGL 的小型 TypeScript 三角网格查看器：

- 三角形上限：500 个
- 输出上限：640×480
- 相机空间近裁剪面：`z = 1`
- 每帧同时生成：RGBA 颜色、`Float32` 深度、原始三角形 ID 缓冲
- 鼠标拾取只查询当前已提交帧的 ID 缓冲，没有第二套射线/包围盒近似命中逻辑
- Worker 渲染，颜色/深度/ID 的 `ArrayBuffer` 通过 transfer 交还主线程
- 迟到帧按 `frameId + width + height` 丢弃，不能替换当前画面或拾取数据

## 运行

```bash
npm install
npm run dev
```

构建和测试：

```bash
npm test
npm run build
```

## 代码结构

- `src/renderer.ts`：唯一的软件光栅化路径；Worker 和测试都调用它。
  - Sutherland–Hodgman 对 `z >= 1` 半空间裁剪
  - 裁剪交点颜色在相机空间线性插值
  - 屏幕三角形使用整数像素中心和上/左填充约定
  - 深度写入相机空间 `z`
  - 颜色用 `1/z` 透视正确插值
- `src/renderWorker.ts`：Worker 协议，把三个缓冲转移回主线程。
- `src/frameState.ts`：帧序号、尺寸和当前唯一可拾取帧的所有权。
- `src/viewer.ts`：Canvas、Worker、尺寸限制、`putImageData` 和鼠标拾取。
- `src/camera.ts`：轨道相机；相机空间投影方向为本地 `+Z`。
- `test/renderer.test.ts`：可手算的小规模测试。

## 测试覆盖

- 跨近裁剪面三角形：交点属性、裁剪后深度、颜色和原始 ID。
- 遮挡：近三角形先提交，远三角形仍必须在深度测试中失败。
- 透视正确插值：核对屏幕重心坐标、`1/z` 深度和颜色。
- 边界像素：精确落在上边界、下边界和共享斜边上的像素只出现一次。
- 换帧竞争：旧相机或旧尺寸的迟到 Worker 响应不会替换当前帧。
- Worker 协议：测试的缓冲来自与真实 Worker 相同的 `createRenderResponse`。
