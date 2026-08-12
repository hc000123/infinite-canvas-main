package repository

import (
	"errors"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func seedSystemPrompts(db *gorm.DB) error {
	now := time.Now().Format(time.RFC3339)
	for _, item := range systemPromptSeeds(now) {
		existing := model.Prompt{}
		err := db.Where("id = ?", item.ID).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if err := db.Create(&item).Error; err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if existing.Category == "" || existing.Category == "system" {
			if err := db.Model(&model.Prompt{}).Where("id = ?", item.ID).Update("category", item.Category).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func systemPromptSeeds(now string) []model.Prompt {
	return []model.Prompt{
		promptSeed(now, "system-scene-multi-angle-general", "场景多角度：通用模板", "生成同一场景的多角度参考图。场景为 {场景描述}，关键元素包括 {固定元素}。请保持空间布局、建筑结构、门窗位置、主要道具、材质、色调、光源方向完全一致，只改变镜头角度和取景范围。\n\n需要生成的角度包括：正面全景、左侧45度、右侧45度、入口视角、反方向视角、俯视布局视角。\n\n画面要求：无人物，空间透视准确，细节稳定，适合作为后续分镜、图片生成和视频生成的场景参考。", []string{"场景多角度", "空间一致性", "参考图"}, "image", "image", "场景多角度", "text", "image", true, []promptSeedVariable{
			{"场景描述", "需要保持一致的空间或地点", "现代室内空间"},
			{"固定元素", "必须在每个角度保留的位置、道具和结构", "门窗、主家具、光源、关键道具"},
		}),
		promptSeed(now, "system-scene-multi-angle-interior", "场景多角度：室内空间", "为 {场景描述} 生成同一空间的多角度参考图。固定元素包括 {固定元素}。请保持房间结构、家具摆放、门窗位置、墙面材质、地面材质、灯光方向和整体色调一致。\n\n输出角度：\n1. 从入口看向空间内部\n2. 从空间内部看向入口\n3. 左侧45度\n4. 右侧45度\n5. 主区域正面全景\n6. 局部细节近景\n\n无人物，真实空间感，透视准确，方便连续分镜使用。", []string{"场景多角度", "室内", "空间一致性"}, "image", "image", "场景多角度", "text", "image", true, []promptSeedVariable{
			{"场景描述", "室内场景的整体描述", "室内空间"},
			{"固定元素", "需要锁定的家具、门窗、装饰和光源", "主要家具、门窗、灯具、地面材质"},
		}),
		promptSeed(now, "system-scene-multi-angle-exterior", "场景多角度：室外地点", "为 {场景描述} 生成同一地点的多角度参考图。固定元素包括 {固定元素}。请保持地形结构、主要建筑位置、道路走向、光照方向、天气、色调和氛围一致。\n\n输出角度：正面广角、左侧45度、右侧45度、远景建立镜头、近景局部、反方向视角。\n\n无人物，环境连续，空间关系清晰，适合短剧分镜和视频镜头参考。", []string{"场景多角度", "室外", "空间一致性"}, "image", "image", "场景多角度", "text", "image", false, []promptSeedVariable{
			{"场景描述", "室外地点的整体描述", "室外地点"},
			{"固定元素", "建筑、道路、地形、光照和天气等稳定信息", "建筑位置、道路、天气、光照方向"},
		}),
		promptSeed(now, "system-scene-multi-angle-comic-background", "场景多角度：漫剧背景", "生成 {场景描述} 的漫剧背景多角度图。请保持同一空间设定不变，包括结构、门窗、家具、装饰物、光源和色调，只改变镜头角度。\n\n角度包括：正面、左45度、右45度、俯视布局、入口视角、局部近景。\n\n风格要求：干净线稿，柔和上色，透视准确，无人物，适合连续漫画分镜背景使用。", []string{"场景多角度", "漫剧背景", "漫画分镜"}, "image", "image", "漫剧背景", "text", "image", false, []promptSeedVariable{
			{"场景描述", "需要生成的漫剧背景空间", "室内或室外背景"},
		}),
		promptSeed(now, "system-scene-multi-angle-live-action", "场景多角度：短剧实拍感", "生成 {场景描述} 的短剧实拍感多角度场景参考。请保持同一拍摄场地的一致性，包括空间结构、道具摆放、材质、灯光方向、色彩氛围和环境细节。\n\n输出角度：建立镜头、人物入场视角、反打视角、左侧机位、右侧机位、俯视空间关系。\n\n无人物，真实镜头质感，电影级光影，适合作为后续角色入场、对峙、动作和视频生成的背景参考。", []string{"场景多角度", "短剧", "实拍感"}, "image", "image", "短剧场景", "text", "image", true, []promptSeedVariable{
			{"场景描述", "短剧拍摄场地描述", "短剧场景"},
		}),
		promptSeed(now, "system-scene-consistency-constraint", "场景一致性约束", "一致性要求：所有角度必须属于同一个场景。不得改变空间布局、门窗数量和位置、家具摆放、主要道具、建筑结构、材质、色调、光源方向、天气和时间。只允许改变镜头角度、镜头距离和取景范围。", []string{"场景一致性", "约束", "正向词"}, "image", "positive", "场景多角度", "text", "image", true, nil),
		promptSeed(now, "system-scene-multi-angle-negative", "场景多角度：负面提示词", "避免不同角度之间场景不一致、家具位置变化、门窗数量变化、建筑结构变化、道具消失或新增、材质变化、光线方向变化、天气变化、时间变化、出现人物、文字、水印、logo、空间扭曲、透视错误、低清晰度。", []string{"场景多角度", "负面提示词"}, "image", "negative", "场景多角度", "text", "image", true, nil),
		promptSeed(now, "system-image-grid-general", "九宫格：通用方案", "基于 {主题描述} 生成九宫格图片方案。九张图需要保持同一主题、同一风格、同一角色或场景设定，只在构图、角度、姿态、光影或细节上做轻微变化。\n\n要求：\n1. 九张图排列为3x3网格\n2. 每张图都清晰可区分\n3. 不改变核心主体设定\n4. 保持统一画风和色调\n5. 每格构图完整，不裁切主体\n6. 适合用于快速挑选最佳方案", []string{"九宫格", "候选图", "图片处理"}, "image", "grid", "图片候选", "text", "image", true, []promptSeedVariable{
			{"主题描述", "需要生成九宫格候选的主体、角色、场景或分镜", "角色或场景设定"},
		}),
		promptSeed(now, "system-image-grid-character-variants", "九宫格：角色变体", "基于参考角色生成九宫格角色变体。保持角色的五官、发型、年龄感、身材比例、服装风格和整体气质一致，只改变表情、姿态、镜头角度和轻微光影。\n\n九宫格排列，3x3，每张图都是同一角色的不同可选方案。背景简洁，人物清晰，适合作为角色定稿筛选。", []string{"九宫格", "角色一致性", "角色变体"}, "image", "grid", "角色设定", "image", "image", true, nil),
		promptSeed(now, "system-image-grid-scene-variants", "九宫格：场景变体", "基于同一场景生成九宫格场景变体。保持空间结构、关键元素、材质、色调和氛围一致，只改变镜头角度、取景范围、光影强弱和局部细节。\n\n九宫格排列，3x3，无人物，每格画面独立完整，适合作为场景定稿筛选。", []string{"九宫格", "场景一致性", "场景变体"}, "image", "grid", "场景设定", "image", "image", true, nil),
		promptSeed(now, "system-image-grid-storyboard-candidates", "九宫格：分镜候选", "基于分镜描述生成九宫格候选画面。九张图保持同一剧情动作、同一角色设定、同一场景和同一情绪，只在镜头角度、构图、人物站位、景别和光影上变化。\n\n分镜描述：{分镜描述}\n\n九宫格排列，3x3，适合从中选择最符合分镜的一张。", []string{"九宫格", "分镜", "候选图"}, "image", "grid", "分镜", "text", "image", true, []promptSeedVariable{
			{"分镜描述", "需要生成候选图的剧情动作和画面要求", "角色在场景中执行动作"},
		}),
		promptSeed(now, "system-image-grid-upscale-selected", "九宫格：指定格高清放大", "请将九宫格中的第 {序号} 张图片单独高清放大。保持该图的主体、构图、角色、场景、光影、色调和风格不变，只提升清晰度、细节、纹理和边缘质量。\n\n不要改变人物五官、服装、姿态、场景结构和画面内容。输出单张高清图，不保留九宫格边框。", []string{"九宫格", "高清放大", "图片处理"}, "image", "image", "高清放大", "image", "image", true, []promptSeedVariable{
			{"序号", "九宫格中要放大的图片序号", "1"},
		}),
		promptSeed(now, "system-image-grid-redraw-selected", "九宫格：指定格重绘增强", "请提取九宫格中的第 {序号} 张图片，并在保持原始构图和内容一致的基础上进行重绘增强。提升画面清晰度、材质细节、面部质量、手部质量、光影层次和整体完成度。\n\n要求不要改变角色身份、动作、服装、场景布局、镜头角度和色彩氛围。输出单张精修图。", []string{"九宫格", "重绘增强", "图片处理"}, "image", "image", "重绘增强", "image", "image", true, []promptSeedVariable{
			{"序号", "九宫格中要重绘增强的图片序号", "1"},
		}),
		promptSeed(now, "system-image-upscale-general", "图片处理：单图高清放大", "对当前图片进行高清放大和细节增强。保持原图构图、主体、人物五官、服装、场景结构、光影和色调不变。提升分辨率、边缘清晰度、纹理细节、皮肤质感和整体画面干净度。\n\n不要改变画面内容，不新增人物或道具，不改变风格。", []string{"高清放大", "图像增强", "图片处理"}, "image", "image", "高清放大", "image", "image", true, nil),
		promptSeed(now, "system-image-detail-repair", "图片处理：细节修复", "对当前图片进行细节修复。重点修复模糊、低清晰度、脸部细节不足、手部异常、边缘粗糙、衣物纹理混乱、背景噪点和轻微变形。\n\n保持原图主体、构图、风格、色调和场景不变，只做自然修复和质量提升。", []string{"细节修复", "图像增强", "图片处理"}, "image", "image", "图像增强", "image", "image", true, nil),
		promptSeed(now, "system-image-face-enhance", "图片处理：人脸增强", "增强图片中人物面部质量。保持人物身份、五官比例、年龄感、表情、发型和妆容一致。提升眼睛、皮肤、嘴唇、面部轮廓和光影细节。\n\n不要换脸，不改变表情，不改变年龄，不改变人物气质。", []string{"人脸增强", "细节修复", "图片处理"}, "image", "image", "人像修复", "image", "image", false, nil),
		promptSeed(now, "system-image-hand-fix", "图片处理：手部修复", "修复图片中人物手部问题。保持原有动作和姿态不变，修正手指数量、手指形状、关节结构、手掌比例和手部与物体的接触关系。\n\n不要改变人物整体姿态、服装、构图和场景。", []string{"手部修复", "细节修复", "图片处理"}, "image", "image", "人像修复", "image", "image", false, nil),
		promptSeed(now, "system-image-remove-artifacts", "图片处理：移除自有标记和杂物", "移除自有图片中的自有水印、logo、无关文字、杂物或画面瑕疵。保持原图主体、背景、构图、光影、色调和风格不变。被移除区域需要自然补全，与周围环境一致。", []string{"自有标记", "杂物移除", "图片处理"}, "image", "image", "图像修复", "image", "image", false, nil),
		promptSeed(now, "system-image-outpaint-background", "图片处理：背景扩图", "在保持主体不变的前提下扩展图片背景。延展原有场景、光影、色调、材质和透视关系，使画面从 {原始画幅} 扩展为 {目标画幅}。\n\n不要改变主体位置、人物五官、服装、姿态和原有画面风格。", []string{"扩图", "背景扩展", "图片处理"}, "image", "image", "扩图", "image", "image", true, []promptSeedVariable{
			{"原始画幅", "当前图片画幅", "1:1"},
			{"目标画幅", "希望扩展后的画幅", "16:9"},
		}),
		promptSeed(now, "system-image-crop-complete", "图片处理：裁切补全", "补全当前图片被裁切的部分。保持主体、服装、场景、透视、光影和色调一致，自然补全缺失区域。不要改变原图已有内容，不新增无关元素。", []string{"裁切补全", "扩图", "图片处理"}, "image", "image", "扩图", "image", "image", false, nil),
		promptSeed(now, "system-image-composition-variants", "图片处理：同图不同构图", "基于当前图片生成同一内容的不同构图版本。保持角色、场景、服装、动作、风格和情绪一致，只改变景别、镜头距离、画面留白和主体位置。\n\n生成多个候选版本，适合封面、分镜或视频首帧选择。", []string{"构图变体", "候选图", "图片处理"}, "image", "image", "构图变体", "image", "image", false, nil),
		promptSeed(now, "system-image-processing-negative", "图片处理：负面提示词", "避免改变主体身份、换脸、改变年龄、改变服装、改变姿态、改变场景结构、新增人物、新增无关道具、风格漂移、过度锐化、塑料皮肤、五官变形、手指错误、文字乱码、水印残留、画面撕裂、低清晰度。", []string{"负面提示词", "图片处理"}, "image", "negative", "图像增强", "text", "image", true, nil),
	}
}

type promptSeedVariable struct {
	name         string
	description  string
	defaultValue string
}

func promptSeed(now string, id string, title string, prompt string, tags []string, nodeGroup string, promptType string, scenario string, inputKind string, outputKind string, favorite bool, variables []promptSeedVariable) model.Prompt {
	metadataVariables := make([]map[string]any, 0, len(variables))
	for _, variable := range variables {
		metadataVariables = append(metadataVariables, map[string]any{
			"name":         variable.name,
			"description":  variable.description,
			"defaultValue": variable.defaultValue,
		})
	}
	metadata := map[string]any{
		"nodeGroup":  nodeGroup,
		"type":       promptType,
		"scenario":   scenario,
		"inputKind":  inputKind,
		"outputKind": outputKind,
		"favorite":   favorite,
	}
	if len(metadataVariables) > 0 {
		metadata["variables"] = metadataVariables
	}
	return model.Prompt{
		ID:        id,
		Title:     title,
		Prompt:    prompt,
		Tags:      tags,
		Metadata:  metadata,
		Category:  systemPromptCategory(id, nodeGroup, scenario),
		Preview:   "系统内置种子模板，可在后台提示词管理中按需编辑。内容用于场景多角度、九宫格、高清放大、重绘增强和图片修复等常用工作流。",
		CreatedAt: now,
		UpdatedAt: now,
	}
}

func systemPromptCategory(id string, nodeGroup string, scenario string) string {
	if nodeGroup == "video" {
		return "video"
	}
	if nodeGroup == "text" {
		return "text"
	}
	value := strings.ToLower(id + " " + scenario)
	if strings.Contains(value, "scene") || strings.Contains(value, "场景") {
		return "scene"
	}
	if strings.Contains(value, "character") || strings.Contains(value, "face") || strings.Contains(value, "hand") || strings.Contains(value, "角色") || strings.Contains(value, "人像") {
		return "character"
	}
	return "prop"
}
