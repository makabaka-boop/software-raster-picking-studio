# Canvas 三角网格查看器

一个不依赖 WebGL 的小型软件光栅器：TypeScript 负责几何与光栅化，渲染在 Web Worker 中完成，主线程只把颜色缓冲写入 Canvas `ImageData`。

## 能力与约束

- 最多 `500` 个输入三角形。
- 输出分辨率最大 `640×480`。
- 相机朝相机空间 `+Z` 观察；近裁剪面固定为 `z=1`。
- 跨越近裁剪面的三角形先在相机空间裁切，再投影和扇形三角化。
- 近裁剪面内使用相机空间 `z` 的深度缓冲，近面获胜。
- 颜色使用 `1/z` 透视正确插值。
- 每帧同时生成：
  - RGBA8 颜色缓冲；
  - `Float32Array` 深度缓冲，背景为 `Infinity`；
  - `Int32Array` 原始三角形 ID 缓冲，背景为 `-1`。
- 鼠标拾取只读取当前已提交帧的 ID 缓冲，不执行独立的射线/近似命中算法。
- 旋转、换网格或调整尺寸都有单调帧序号；迟到 Worker 帧不会替换新画面，也不会替换深度和拾取数据。

## 运行

```bash
npm install
npm run dev
```

构建与检查：

```bash
npm test
npm run typecheck
npm run build
```

## 代码结构

- `src/renderer.ts`：相机变换、近平面 Sutherland–Hodgman 裁切、投影、边缘函数、透视插值和深度缓冲。
- `src/renderWorker.ts`：Worker 包装；渲染结果的三个 `ArrayBuffer` 以 Transferable 对象回传。
- `src/viewer.ts`：Canvas `ImageData`、旋转/尺寸请求合并、帧序号和迟到帧提交规则。
- `src/frame.ts`：帧提交、尺寸/序号检查和基于 ID 缓冲的拾取。
- `src/main.ts`：可交互演示，拖动旋转，点击查询三角形 ID。
- `test/`：可手算的小三角形测试，覆盖近裁剪、遮挡、透视插值、边界像素、限制值和换帧竞争。

## 光栅化约定

像素在整数像素中心 `(x + 0.5, y + 0.5)` 求值。相邻三角形共享边采用 top-left 归属规则：水平向右的边和竖直向下的边允许 `E === 0`，其余边保留微小数值容差。这样共享边不会被两个三角形重复写入。
