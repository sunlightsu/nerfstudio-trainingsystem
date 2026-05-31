"""Nerfstudio Web GUI — FastAPI 后端

提供三个 SSE 端点，在 conda nerfstudio 环境中执行命令行：
  POST /api/process  — ns-process-data（图像预处理）
  POST /api/train    — ns-train（训练）
  POST /api/export   — ns-export（导出）

访问 http://localhost:8000/docs 查看自动生成的 Swagger UI。
"""

import asyncio
import json
import os
from pathlib import Path
from typing import AsyncGenerator, Optional

from fastapi import FastAPI, Query, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader
from pydantic import BaseModel, Field

# ── 常量 ──────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
PATHS_FILE = BASE_DIR / "saved_paths.json"
CONDA_ENV = "nerfstudio"

# ── FastAPI 初始化 ──────────────────────────────────────────────

app = FastAPI(title="Nerfstudio GUI", version="1.0.0")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# 手动配置 Jinja2 Environment，禁用缓存以兼容 Python 3.14
jinja_env = Environment(
    loader=FileSystemLoader(str(BASE_DIR / "templates")),
    auto_reload=True,
    cache_size=0,
)


def render_template(name: str, request: Request) -> HTMLResponse:
    """渲染 Jinja2 模板并返回 HTMLResponse。"""
    template = jinja_env.get_template(name)
    return HTMLResponse(template.render(request=request))


# ── 路径书签 ────────────────────────────────────────────────────

PATHS_FILE = BASE_DIR / "saved_paths.json"


def load_saved_paths() -> list[str]:
    if PATHS_FILE.exists():
        return json.loads(PATHS_FILE.read_text(encoding="utf-8"))
    return []


def save_saved_paths(paths: list[str]):
    PATHS_FILE.write_text(json.dumps(paths, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Pydantic 模型 ────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    data_type: str = Field("images", description="数据源类型：images 或 video")
    data: str = Field(..., description="输入数据路径")
    output_dir: str = Field(..., description="输出目录")
    camera_type: str = Field("perspective", description="相机模型：perspective / fisheye / pinhole / simple_pinhole")
    matching_method: str = Field("vocab_tree", description="特征匹配方式：vocab_tree / exhaustive / sequential")
    sfm_tool: str = Field("any", description="SfM 工具：any / colmap / hloc")
    gpu: bool = Field(True, description="是否使用 GPU")
    # 可选参数
    num_downscales: Optional[int] = Field(None, description="图像降采样次数")
    max_dataset_size: Optional[int] = Field(None, description="最大数据集图像数")
    crop_factor: Optional[str] = Field(None, description="裁剪比例：top bottom left right")
    feature_type: Optional[str] = Field(None, description="特征类型（hloc 用）")
    matcher_type: Optional[str] = Field(None, description="匹配器类型（hloc 用）")
    refine_pixsfm: bool = Field(False, description="是否用 Pixel-Perfect SfM 精化")
    refine_intrinsics: bool = Field(True, description="BA 精化内参")
    use_sfm_depth: bool = Field(False, description="是否导出 SfM 深度图")
    same_dimensions: bool = Field(True, description="图像尺寸是否一致")
    use_single_camera_mode: bool = Field(True, description="是否假设所有图像使用同一相机内参（仅 hloc）")
    percent_radius_crop: Optional[float] = Field(None, description="圆形裁剪遮罩半径（图像对角线百分比）")
    verbose: bool = Field(False, description="详细输出")
    skip_colmap: bool = Field(False, description="跳过 COLMAP")
    skip_image_processing: bool = Field(False, description="跳过图像处理")
    colmap_model_path: Optional[str] = Field(None, description="COLMAP 模型路径（仅 --skip-colmap 时使用）")
    colmap_cmd: Optional[str] = Field(None, description="COLMAP 可执行文件路径")
    images_per_equirect: Optional[int] = Field(None, description="每张全景图采样数（仅 equirectangular，8 或 14）")
    crop_bottom: Optional[float] = Field(None, description="底部裁剪比例 [0,1]")
    include_depth_debug: bool = Field(False, description="导出 SfM 深度调试图像")
    eval_data: Optional[str] = Field(None, description="评估数据路径（None 则复用训练数据）")
    # video 专属
    num_frames_per_second: Optional[float] = Field(None, description="每秒抽帧数（video 模式）")
    start_frame: Optional[int] = Field(None, description="起始帧（video 模式）")
    end_frame: Optional[int] = Field(None, description="结束帧（video 模式）")


class TrainRequest(BaseModel):
    method: str = Field(..., description="训练方法名，如 nerfacto / splatfacto / instant-ngp")
    data: str = Field(..., description="数据路径（nerfstudio 格式）")
    output_dir: str = Field("outputs", description="输出目录")
    experiment_name: Optional[str] = Field(None, description="实验名称")
    max_num_iterations: int = Field(30000, description="最大迭代次数")
    vis: str = Field("viewer", description="可视化方式")
    mixed_precision: Optional[bool] = Field(None, description="混合精度（nerfacto 默认 True，splatfacto 默认 False）")
    steps_per_save: int = Field(2000, description="每 N 步保存检查点")
    steps_per_eval_batch: Optional[int] = Field(None, description="每 N 步评估批次")
    steps_per_eval_image: Optional[int] = Field(None, description="每 N 步评估单张图像")
    steps_per_eval_all_images: Optional[int] = Field(None, description="每 N 步评估所有图像")
    # 数据参数 (--pipeline.datamanager.*)
    train_num_rays_per_batch: Optional[int] = Field(None, description="每批训练光线数")
    cache_images_type: Optional[str] = Field(None, description="图像缓存类型：uint8 / float32")
    camera_res_scale_factor: Optional[float] = Field(None, description="图像缩放因子")
    # 模型核心参数 (--pipeline.model.*)
    num_nerf_samples_per_ray: Optional[int] = Field(None, description="NeRF 网络每光线采样数")
    num_proposal_samples_per_ray: Optional[str] = Field(None, description="提议网络每光线采样数（空格分隔两个值）")
    max_res: Optional[int] = Field(None, description="哈希网格最大分辨率")
    log2_hashmap_size: Optional[int] = Field(None, description="哈希表大小（2^N）")
    num_levels: Optional[int] = Field(None, description="哈希网格层级数")
    hidden_dim: Optional[int] = Field(None, description="MLP 隐藏层维度")
    hidden_dim_color: Optional[int] = Field(None, description="颜色网络隐藏层维度")
    near_plane: Optional[float] = Field(None, description="光线起始采样距离")
    far_plane: Optional[float] = Field(None, description="光线结束采样距离")
    background_color: Optional[str] = Field(None, description="背景色：random / last_sample / black / white")
    camera_optimizer_mode: Optional[str] = Field(None, description="相机优化模式：off / SO3xR3 / SE3")
    # splatfacto 专属
    sh_degree: Optional[int] = Field(None, description="最大球谐阶数（splatfacto）")
    cull_alpha_thresh: Optional[float] = Field(None, description="透明度剔除阈值（splatfacto）")
    densify_grad_thresh: Optional[float] = Field(None, description="稠密化梯度阈值（splatfacto）")
    ssim_lambda: Optional[float] = Field(None, description="SSIM 损失权重（splatfacto）")
    refine_every: Optional[int] = Field(None, description="高斯精化间隔（splatfacto）")
    random_init: Optional[bool] = Field(None, description="随机初始化高斯（splatfacto）")


class ExportRequest(BaseModel):
    export_method: str = Field(..., description="导出方式：poisson / tsdf / pointcloud / gaussian-splat / marching-cubes / cameras")
    load_config: str = Field(..., description="训练输出的 config.yml 路径（必填）")
    output_dir: str = Field(..., description="导出输出目录（必填）")
    # 点云采样（poisson / pointcloud 共用）
    num_points: Optional[int] = Field(None, description="采样点数（默认 1000000）")
    remove_outliers: Optional[bool] = Field(None, description="是否移除离群点（默认 True）")
    reorient_normals: Optional[bool] = Field(None, description="是否基于视角重定向法线（默认 True）")
    normal_method: Optional[str] = Field(None, description="法线估计方式：open3d / model_output")
    normal_output_name: Optional[str] = Field(None, description="法线输出名称")
    depth_output_name: Optional[str] = Field(None, description="深度输出名称")
    rgb_output_name: Optional[str] = Field(None, description="RGB 输出名称")
    # 包围盒裁剪（poisson / pointcloud 共用）
    obb_center: Optional[str] = Field(None, description="有向包围盒中心 x y z")
    obb_rotation: Optional[str] = Field(None, description="有向包围盒旋转 RPY 弧度")
    obb_scale: Optional[str] = Field(None, description="有向包围盒缩放 x y z")
    # 性能
    num_rays_per_batch: Optional[int] = Field(None, description="每批光线数（默认 32768）")
    # 离群点
    std_ratio: Optional[float] = Field(None, description="离群点阈值标准差倍数（默认 10.0）")
    # pointcloud 专属
    save_world_frame: Optional[bool] = Field(None, description="保存世界坐标系点云")
    # poisson 专属
    save_point_cloud: Optional[bool] = Field(None, description="是否保存中间点云")
    texture_method: Optional[str] = Field(None, description="纹理方式：point_cloud / nerf")
    px_per_uv_triangle: Optional[int] = Field(None, description="每个 UV 三角的像素数（默认 4）")
    unwrap_method: Optional[str] = Field(None, description="UV 展开方式：xatlas / custom")
    num_pixels_per_side: Optional[int] = Field(None, description="纹理图分辨率（默认 2048）")
    target_num_faces: Optional[int] = Field(None, description="目标三角面数（默认 50000）")
    # tsdf / marching-cubes 共享
    resolution: Optional[str] = Field(None, description="体素分辨率（整数或 x,y,z）")
    bounding_box_min: Optional[str] = Field(None, description="包围盒最小值 x,y,z")
    bounding_box_max: Optional[str] = Field(None, description="包围盒最大值 x,y,z")
    # tsdf 专属
    downscale_factor: Optional[int] = Field(None, description="图像降采样因子（tsdf）")
    batch_size: Optional[int] = Field(None, description="每批深度图数（tsdf）")
    # marching-cubes 专属
    simplify_mesh: Optional[bool] = Field(None, description="是否简化网格")
    isosurface_threshold: Optional[float] = Field(None, description="等值面阈值")
    # gaussian-splat 专属
    output_filename: Optional[str] = Field(None, description="输出文件名（默认 splat.ply）")
    ply_color_mode: Optional[str] = Field(None, description="PLY 颜色模式：sh_coeffs / rgb")

def _opt(key: str, value, quote: bool = False, bool_as_flag: bool = True) -> str:
    """构建单个 CLI 选项字符串。None 跳过；bool 按 bool_as_flag 控制；含空格自动加引号。"""
    if value is None:
        return ""
    if isinstance(value, bool):
        if bool_as_flag:
            return f"--{key}" if value else ""
        return f"--{key} {str(value)}"
    s = str(value)
    if quote and " " in s:
        return f'--{key} "{s}"'
    return f"--{key} {s}"


def _add_params(parts: list[str], pairs: list[tuple[str, object]], *, bool_as_flag: bool = True) -> None:
    """将 (key, value) 元组列表逐个调用 _opt 后追加到 parts。（原地修改）"""
    for key, val in pairs:
        opt = _opt(key, val, bool_as_flag=bool_as_flag)
        if opt:
            parts.append(opt)


def build_process_cmd(r: ProcessRequest) -> str:
    parts = [
        f"ns-process-data {r.data_type}",
        _opt("data", r.data, quote=True),
        _opt("output-dir", r.output_dir, quote=True),
        _opt("camera-type", r.camera_type),
        _opt("matching-method", r.matching_method),
        _opt("sfm-tool", r.sfm_tool),
        _opt("gpu", r.gpu),
    ]
    _add_params(parts, [
        ("num-downscales", r.num_downscales),
        ("max-dataset-size", r.max_dataset_size),
        ("crop-factor", r.crop_factor),
        ("crop-bottom", r.crop_bottom),
        ("feature-type", r.feature_type),
        ("matcher-type", r.matcher_type),
        ("refine-pixsfm", r.refine_pixsfm),
        ("refine-intrinsics", r.refine_intrinsics),
        ("use-sfm-depth", r.use_sfm_depth),
        ("include-depth-debug", r.include_depth_debug),
        ("same-dimensions", r.same_dimensions),
        ("use-single-camera-mode", r.use_single_camera_mode),
        ("percent-radius-crop", r.percent_radius_crop),
        ("verbose", r.verbose),
        ("skip-colmap", r.skip_colmap),
        ("skip-image-processing", r.skip_image_processing),
        ("colmap-model-path", r.colmap_model_path),
        ("colmap-cmd", r.colmap_cmd),
        ("images-per-equirect", r.images_per_equirect),
        ("eval-data", r.eval_data),
        ("num-frames-per-second", r.num_frames_per_second),
        ("start-frame", r.start_frame),
        ("end-frame", r.end_frame),
    ])
    return " ".join(parts)


def build_train_cmd(r: TrainRequest) -> str:
    parts = [
        f"ns-train {r.method}",
        _opt("data", r.data, quote=True),
        _opt("output-dir", r.output_dir, quote=True),
        _opt("experiment-name", r.experiment_name, quote=True),
        _opt("max-num-iterations", r.max_num_iterations),
        _opt("vis", r.vis),
        _opt("mixed-precision", r.mixed_precision),
        _opt("steps-per-save", r.steps_per_save if r.steps_per_save != 2000 else None),
    ]
    # pipeline.datamanager
    dm_prefix = "pipeline.datamanager."
    if r.method == "nerfacto":
        _add_params(parts, [
            (f"{dm_prefix}train-num-rays-per-batch", r.train_num_rays_per_batch),
            (f"{dm_prefix}cache-images-type", r.cache_images_type),
            (f"{dm_prefix}camera-res-scale-factor", r.camera_res_scale_factor),
        ])
    elif r.method == "splatfacto":
        _add_params(parts, [
            (f"{dm_prefix}cache-images-type", r.cache_images_type),
            (f"{dm_prefix}camera-res-scale-factor", r.camera_res_scale_factor),
        ])
    # pipeline.model — nerfacto 专属
    mdl_prefix = "pipeline.model."
    if r.method == "nerfacto":
        _add_params(parts, [
            (f"{mdl_prefix}num-nerf-samples-per-ray", r.num_nerf_samples_per_ray),
            (f"{mdl_prefix}num-proposal-samples-per-ray", r.num_proposal_samples_per_ray),
            (f"{mdl_prefix}max-res", r.max_res),
            (f"{mdl_prefix}log2-hashmap-size", r.log2_hashmap_size),
            (f"{mdl_prefix}num-levels", r.num_levels),
            (f"{mdl_prefix}hidden-dim", r.hidden_dim),
            (f"{mdl_prefix}hidden-dim-color", r.hidden_dim_color),
            (f"{mdl_prefix}near-plane", r.near_plane),
            (f"{mdl_prefix}far-plane", r.far_plane),
        ])
    # pipeline.model — 公共参数
    parts.append(_opt(f"{mdl_prefix}background-color", r.background_color))
    if r.camera_optimizer_mode is not None:
        parts.append(_opt(f"{mdl_prefix}camera-optimizer.mode", r.camera_optimizer_mode))
    # splatfacto 专属
    if r.method == "splatfacto":
        _add_params(parts, [
            (f"{mdl_prefix}sh-degree", r.sh_degree),
            (f"{mdl_prefix}cull-alpha-thresh", r.cull_alpha_thresh),
            (f"{mdl_prefix}densify-grad-thresh", r.densify_grad_thresh),
            (f"{mdl_prefix}ssim-lambda", r.ssim_lambda),
            (f"{mdl_prefix}refine-every", r.refine_every),
            (f"{mdl_prefix}random-init", r.random_init),
        ])
    return " ".join(parts)


def build_export_cmd(r: ExportRequest) -> str:
    parts = [
        f"ns-export {r.export_method}",
        _opt("load-config", r.load_config, quote=True),
        _opt("output-dir", r.output_dir, quote=True),
    ]
    # 共享参数组（按 CLI 标志名 → 请求字段）
    _pc_base = [
        ("num-points", r.num_points),
        ("remove-outliers", r.remove_outliers),
        ("reorient-normals", r.reorient_normals),
        ("normal-method", r.normal_method),
        ("normal-output-name", r.normal_output_name),
        ("depth-output-name", r.depth_output_name),
        ("rgb-output-name", r.rgb_output_name),
    ]
    _obb = [
        ("obb-center", r.obb_center),
        ("obb-rotation", r.obb_rotation),
        ("obb-scale", r.obb_scale),
    ]
    _perf = [
        ("num-rays-per-batch", r.num_rays_per_batch),
        ("std-ratio", r.std_ratio),
    ]
    _mesh_tex = [
        ("texture-method", r.texture_method),
        ("target-num-faces", r.target_num_faces),
        ("num-pixels-per-side", r.num_pixels_per_side),
    ]
    _bbox = [
        ("bounding-box-min", r.bounding_box_min),
        ("bounding-box-max", r.bounding_box_max),
    ]

    method_params: dict[str, list[tuple[str, object]]] = {
        "poisson": _pc_base + _obb + _perf + _mesh_tex + [
            ("save-point-cloud", r.save_point_cloud),
            ("px-per-uv-triangle", r.px_per_uv_triangle),
            ("unwrap-method", r.unwrap_method),
        ],
        "pointcloud": _pc_base + _obb + _perf + [
            ("save-world-frame", r.save_world_frame),
        ],
        "tsdf": [
            ("downscale-factor", r.downscale_factor),
            ("resolution", r.resolution),
            ("batch-size", r.batch_size),
        ] + _bbox + _mesh_tex,
        "gaussian-splat": [
            ("output-filename", r.output_filename),
            ("ply-color-mode", r.ply_color_mode),
        ] + _obb,
        "marching-cubes": [
            ("resolution", r.resolution),
            ("isosurface-threshold", r.isosurface_threshold),
            ("simplify-mesh", r.simplify_mesh),
        ] + _bbox + _mesh_tex,
        "cameras": [],
    }
    _add_params(parts, method_params.get(r.export_method, []), bool_as_flag=False)
    return " ".join(parts)


# ── Shell 执行器 ─────────────────────────────────────────────────

async def run_in_conda(cmd: str) -> AsyncGenerator[str, None]:
    """在 conda nerfstudio 环境中执行命令，逐行 yield 输出。"""
    full_cmd = f'cmd /c "conda activate {CONDA_ENV} && {cmd}"'
    proc = await asyncio.create_subprocess_shell(
        full_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    if proc.stdout is None:
        yield "__EXIT_CODE__:-1\n"
        return
    async for line in proc.stdout:
        yield line.decode("utf-8", errors="replace")
    await proc.wait()
    yield f"__EXIT_CODE__:{proc.returncode}\n"


async def sse_stream(cmd: str) -> AsyncGenerator[str, None]:
    """将 run_in_conda 输出包装为 SSE 格式。"""
    yield f"__CMD__:{cmd}\n"
    async for chunk in run_in_conda(cmd):
        yield chunk


# ── API 路由 ─────────────────────────────────────────────────────

@app.get("/")
def index(request: Request):
    return render_template("index.html", request)


@app.post("/api/process")
async def api_process(req: ProcessRequest):
    cmd = build_process_cmd(req)
    return StreamingResponse(sse_stream(cmd), media_type="text/event-stream")


@app.post("/api/train")
async def api_train(req: TrainRequest):
    cmd = build_train_cmd(req)
    return StreamingResponse(sse_stream(cmd), media_type="text/event-stream")


@app.post("/api/export")
async def api_export(req: ExportRequest):
    cmd = build_export_cmd(req)
    return StreamingResponse(sse_stream(cmd), media_type="text/event-stream")


@app.post("/api/preview")
async def api_preview(request: Request):
    """仅预览命令，不执行。根据请求体中的 _type 字段路由到对应 builder。"""
    body = await request.json()
    ptype = body.pop("_type", "train")
    model_cls, builder = {
        "process": (ProcessRequest, build_process_cmd),
        "export": (ExportRequest, build_export_cmd),
    }.get(ptype, (TrainRequest, build_train_cmd))
    return {"cmd": builder(model_cls(**body))}


@app.get("/api/browse")
async def api_browse(path: str = Query(default="E:\\")):
    """浏览文件系统，返回目录下的文件夹列表。"""
    p = Path(path)
    if not p.exists():
        return {"error": f"路径不存在", "folders": [], "parent": None}
    if not p.is_dir():
        p = p.parent
    try:
        items = []
        for child in sorted(p.iterdir()):
            if child.is_dir() and not child.name.startswith("."):
                items.append({"name": child.name, "path": str(child), "type": "folder"})
        parent = str(p.parent) if p.parent != p else None
        return {"folders": items, "current": str(p), "parent": parent}
    except PermissionError:
        return {"error": "无权限访问", "folders": [], "current": str(p), "parent": str(p.parent)}


@app.get("/api/paths")
async def get_saved_paths():
    return {"paths": load_saved_paths()}


@app.post("/api/paths")
async def add_saved_path(req: Request):
    body = await req.json()
    new_path = body.get("path", "").strip()
    if not new_path:
        return {"error": "路径为空"}
    paths = load_saved_paths()
    if new_path not in paths:
        paths.append(new_path)
        save_saved_paths(paths)
    return {"paths": paths}


@app.delete("/api/paths")
async def remove_path(req: Request):
    body = await req.json()
    target = body.get("path", "").strip()
    paths = load_saved_paths()
    paths = [p for p in paths if p != target]
    save_saved_paths(paths)
    return {"paths": paths}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
