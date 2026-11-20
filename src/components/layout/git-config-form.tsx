import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GitSyncConfigRequest, GitSyncConfigDTO } from "@/lib/types/git";
import { createGitSyncSchema } from "@/lib/validations/git-sync-schema";
import { useGitHandle } from "@/components/api-handle/git-handle";
import { useAppStore } from "@/stores/app-store";
import { Eye, EyeOff, ShieldCheck, Plus, Trash2, ChevronDown, ChevronUp, Sparkles, CircleAlert } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { VaultType } from "@/lib/types/vault";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useForm, useFieldArray } from "react-hook-form";


interface GitConfigFormProps {
    /** 现有配置(编辑模式) */
    config?: GitSyncConfigDTO
    /** 笔记本列表 */
    vaults: VaultType[]
    /** 提交成功回调 */
    onSubmit: () => void
    /** 取消回调 */
    onCancel?: () => void
}

const DEFAULT_CONFIG_SYNC_RULES = [".obsidian/appearance.json", ".obsidian/community-plugins.json"];

function FieldTooltip({ content }: { content: string }) {
    return (
        <Tooltip
            content={content}
            side="top"
            align="start"
            delay={150}
            className="max-w-xs whitespace-normal leading-relaxed px-3 py-2 text-left font-normal shadow-lg"
        >
            <CircleAlert className="h-3.5 w-3.5 text-muted-foreground/75 hover:text-primary cursor-help transition-colors shrink-0" />
        </Tooltip>
    )
}

/**
 * Git 仓库配置表单组件
 */
export function GitConfigForm({ config, vaults, onSubmit, onCancel }: GitConfigFormProps) {
    const { t } = useTranslation()
    const { handleGitSyncUpdate, handleGitSyncValidate } = useGitHandle()
    const setDirty = useAppStore(state => state.setDirty)

    const [showPassword, setShowPassword] = useState(false)
    const [isValidating, setIsValidating] = useState(false)
    const hasBlogConfig = Boolean(
        config?.sourceDir ||
        config?.targetSubdir ||
        config?.requireFrontmatter ||
        config?.validateFrontmatter ||
        config?.bundleAssets ||
        config?.webhookUrl
    )
    const [isBlogSectionOpen, setIsBlogSectionOpen] = useState(hasBlogConfig)

    const schema = useMemo(() => createGitSyncSchema(t), [t])

    const configSyncRulesJson = useMemo(
        () => JSON.stringify(config?.configSyncRules || DEFAULT_CONFIG_SYNC_RULES),
        [config?.configSyncRules]
    )

    const defaultValues = useMemo(() => (
        config ? {
            id: config.id,
            vault: config.vault || "",
            repoUrl: config.repoUrl,
            branch: config.branch,
            username: config.username,
            password: config.password,
            isEnabled: config.isEnabled,
            delay: config.delay,
            retentionDays: config.retentionDays ?? 30,
            includeConfig: config.includeConfig,
            configSyncRules: config.configSyncRules || [],
            sourceDir: config.sourceDir ?? "",
            targetSubdir: config.targetSubdir ?? "",
            requireFrontmatter: config.requireFrontmatter ?? "",
            validateFrontmatter: config.validateFrontmatter ?? false,
            bundleAssets: config.bundleAssets ?? false,
            webhookUrl: config.webhookUrl ?? "",
        } : {
            vault: "",
            isEnabled: true,
            branch: "main",
            delay: 10,
            retentionDays: 30,
            includeConfig: false,
            configSyncRules: DEFAULT_CONFIG_SYNC_RULES,
            sourceDir: "",
            targetSubdir: "",
            requireFrontmatter: "",
            validateFrontmatter: false,
            bundleAssets: false,
            webhookUrl: "",
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [config?.id, config?.vault, config?.repoUrl, config?.branch, config?.username, config?.password, config?.isEnabled, config?.delay, config?.retentionDays, config?.includeConfig, configSyncRulesJson, config?.sourceDir, config?.targetSubdir, config?.requireFrontmatter, config?.validateFrontmatter, config?.bundleAssets, config?.webhookUrl])

    const { register, handleSubmit, formState: { errors, isSubmitting, isDirty }, setValue, getValues, reset, watch, control } = useForm<GitSyncConfigRequest>({
        resolver: zodResolver(schema),
        defaultValues,
    })

    useEffect(() => {
        setDirty('git-config', isDirty)
    }, [isDirty, setDirty])

    const { fields, append, remove } = useFieldArray({
        control,
        name: "configSyncRules" as never
    })

    const selectedVault = watch("vault")
    const isEnabled = watch("isEnabled")
    const includeConfig = watch("includeConfig")
    const validateFrontmatter = watch("validateFrontmatter")
    const bundleAssets = watch("bundleAssets")

    useEffect(() => {
        reset(defaultValues)
        setShowPassword(false)
        setIsBlogSectionOpen(hasBlogConfig)
    }, [defaultValues, reset, hasBlogConfig])

    const handleApplyFireflyPreset = useCallback(() => {
        if (!getValues("branch")?.trim()) {
            setValue("branch", "main", { shouldDirty: true, shouldValidate: true })
        }
        if (!getValues("sourceDir")?.trim()) {
            setValue("sourceDir", "Blog", { shouldDirty: true, shouldValidate: true })
        }
        setValue("targetSubdir", "src/content/posts", { shouldDirty: true, shouldValidate: true })
        setValue("requireFrontmatter", "type=share", { shouldDirty: true, shouldValidate: true })
        setValue("validateFrontmatter", true, { shouldDirty: true, shouldValidate: true })
        setValue("bundleAssets", true, { shouldDirty: true, shouldValidate: true })
        setValue("delay", 60, { shouldDirty: true, shouldValidate: true })
        setValue("includeConfig", false, { shouldDirty: true, shouldValidate: true })
        setIsBlogSectionOpen(true)
    }, [getValues, setValue])

    const handleCancel = useCallback(() => {
        reset(defaultValues)
        setShowPassword(false)
        onCancel?.()
    }, [defaultValues, reset, onCancel])

    // ESC 键取消
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && onCancel) {
                e.preventDefault()
                handleCancel()
            }
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [handleCancel, onCancel])

    const onFormSubmit = async (data: GitSyncConfigRequest) => {
        await handleGitSyncUpdate(data, () => {
            onSubmit()
        })
    }

    return (
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                {/* 关联笔记本 */}
                <div className="space-y-1.5">
                    <Label htmlFor="vault" className="text-xs font-semibold text-muted-foreground ml-1">{t("ui.backup.vault")}</Label>
                    <Select
                        name="vault"
                        onValueChange={(value) => setValue("vault", value, { shouldDirty: true, shouldValidate: true })}
                        value={selectedVault || ""}>
                        <SelectTrigger id="vault" className="bg-background border-input focus:ring-primary/20">
                            <SelectValue placeholder={t("ui.backup.selectVault")} />
                        </SelectTrigger>
                        <SelectContent>
                            {vaults.map((v) => (
                                <SelectItem value={v.vault} key={v.id}>
                                    {v.vault}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {errors.vault && <p className="text-[11px] text-destructive mt-1 ml-1">{errors.vault.message}</p>}
                </div>

                {/* 分支名称 */}
                <div className="space-y-1.5">
                    <Label htmlFor="branch" className="text-xs font-semibold text-muted-foreground ml-1">{t("ui.git.form.branch")}</Label>
                    <Input id="branch" autoComplete="off" className="bg-background border-input" {...register("branch")} />
                    {errors.branch && <p className="text-[11px] text-destructive mt-1 ml-1">{errors.branch.message}</p>}
                </div>

                {/* 仓库协议地址 */}
                <div className="md:col-span-2 space-y-1.5">
                    <Label htmlFor="repoUrl" className="text-xs font-semibold text-muted-foreground ml-1">{t("ui.git.repoUrl")}</Label>
                    <Input
                        id="repoUrl"
                        placeholder="https://github.com/username/blog-repo.git"
                        autoComplete="off"
                        className="bg-background border-input"
                        {...register("repoUrl")}
                    />
                    {errors.repoUrl && <p className="text-[11px] text-destructive mt-1 ml-1">{errors.repoUrl.message}</p>}
                </div>

                {/* 用户名 */}
                <div className="space-y-1.5">
                    <Label htmlFor="username" className="text-xs font-semibold text-muted-foreground ml-1">{t("ui.auth.username")}</Label>
                    <Input id="username" autoComplete="off" className="bg-background border-input" {...register("username")} />
                    {errors.username && <p className="text-[11px] text-destructive mt-1 ml-1">{errors.username.message}</p>}
                </div>

                {/* 密码 / Token */}
                <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-semibold text-muted-foreground ml-1">{t("ui.auth.password")} / Token</Label>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            className="bg-background border-input pr-10"
                            {...register("password")}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                    </div>
                    {errors.password && <p className="text-[11px] text-destructive mt-1 ml-1">{errors.password.message}</p>}
                </div>

                {/* 自动同步延迟 */}
                <div className="space-y-1.5">
                    <Label htmlFor="delay" className="text-xs font-semibold text-muted-foreground ml-1">{t("ui.git.form.delay")}</Label>
                    <Input id="delay" type="number" className="bg-background border-input" {...register("delay", { valueAsNumber: true })} />
                    {errors.delay && <p className="text-[11px] text-destructive mt-1 ml-1">{errors.delay.message}</p>}
                </div>

                {/* 历史保留天数 */}
                <div className="space-y-1.5">
                    <Label htmlFor="retentionDays" className="text-xs font-semibold text-muted-foreground ml-1">
                        {t("ui.git.retentionDays")}
                    </Label>
                    <Input
                        id="retentionDays"
                        type="number"
                        className="bg-background border-input"
                        {...register("retentionDays", { valueAsNumber: true })}
                    />
                    <p className="text-[10px] text-muted-foreground ml-1">{t("ui.git.retentionDaysDesc")}</p>
                    {errors.retentionDays && <p className="text-[11px] text-destructive mt-1 ml-1">{errors.retentionDays.message}</p>}
                </div>
            </div>

            {/* 子目录映射与博客自动发布（Astro / Firefly） */}
            <div className="rounded-xl border border-border/70 bg-background/60 p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <button
                        type="button"
                        aria-expanded={isBlogSectionOpen}
                        onClick={() => setIsBlogSectionOpen((prev) => !prev)}
                        className="flex items-center gap-2 text-left group"
                    >
                        {isBlogSectionOpen ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                        ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                        )}
                        <div>
                            <span className="text-sm font-semibold text-foreground">{t("ui.git.form.blogPublishTitle")}</span>
                            <p className="text-[11px] text-muted-foreground">{t("ui.git.form.blogPublishDesc")}</p>
                        </div>
                    </button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleApplyFireflyPreset}
                        className="h-8 text-xs shrink-0 self-start sm:self-center border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
                    >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        {t("ui.git.form.applyFireflyPreset")}
                    </Button>
                </div>

                {isBlogSectionOpen && (
                    <div className="space-y-4 pt-3 border-t border-border/50 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                            {/* 源目录前缀 */}
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5 ml-1">
                                    <Label htmlFor="sourceDir" className="text-xs font-semibold text-muted-foreground">
                                        {t("ui.git.form.sourceDir")}
                                    </Label>
                                    <FieldTooltip content={t("ui.git.form.sourceDirTooltip")} />
                                </div>
                                <Input
                                    id="sourceDir"
                                    autoComplete="off"
                                    placeholder={t("ui.git.form.sourceDirPlaceholder")}
                                    className="bg-background border-input"
                                    {...register("sourceDir")}
                                />
                                <p className="text-[10px] text-muted-foreground ml-1">{t("ui.git.form.sourceDirDesc")}</p>
                                {errors.sourceDir && <p className="text-[11px] text-destructive mt-1 ml-1">{errors.sourceDir.message}</p>}
                            </div>

                            {/* 目标仓库子目录沙箱 */}
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5 ml-1">
                                    <Label htmlFor="targetSubdir" className="text-xs font-semibold text-muted-foreground">
                                        {t("ui.git.form.targetSubdir")}
                                    </Label>
                                    <FieldTooltip content={t("ui.git.form.targetSubdirTooltip")} />
                                </div>
                                <Input
                                    id="targetSubdir"
                                    autoComplete="off"
                                    placeholder={t("ui.git.form.targetSubdirPlaceholder")}
                                    className="bg-background border-input"
                                    {...register("targetSubdir")}
                                />
                                <p className="text-[10px] text-muted-foreground ml-1">{t("ui.git.form.targetSubdirDesc")}</p>
                                {errors.targetSubdir && <p className="text-[11px] text-destructive mt-1 ml-1">{errors.targetSubdir.message}</p>}
                            </div>

                            {/* Frontmatter 过滤条件 */}
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5 ml-1">
                                    <Label htmlFor="requireFrontmatter" className="text-xs font-semibold text-muted-foreground">
                                        {t("ui.git.form.requireFrontmatter")}
                                    </Label>
                                    <FieldTooltip content={t("ui.git.form.requireFrontmatterTooltip")} />
                                </div>
                                <Input
                                    id="requireFrontmatter"
                                    autoComplete="off"
                                    placeholder={t("ui.git.form.requireFrontmatterPlaceholder")}
                                    className="bg-background border-input"
                                    {...register("requireFrontmatter")}
                                />
                                <p className="text-[10px] text-muted-foreground ml-1">{t("ui.git.form.requireFrontmatterDesc")}</p>
                                {errors.requireFrontmatter && <p className="text-[11px] text-destructive mt-1 ml-1">{errors.requireFrontmatter.message}</p>}
                            </div>

                            {/* 构建重试 Webhook 地址 */}
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5 ml-1">
                                    <Label htmlFor="webhookUrl" className="text-xs font-semibold text-muted-foreground">
                                        {t("ui.git.form.webhookUrl")}
                                    </Label>
                                    <FieldTooltip content={t("ui.git.form.webhookUrlTooltip")} />
                                </div>
                                <Input
                                    id="webhookUrl"
                                    autoComplete="off"
                                    placeholder={t("ui.git.form.webhookUrlPlaceholder")}
                                    className="bg-background border-input"
                                    {...register("webhookUrl")}
                                />
                                <p className="text-[10px] text-muted-foreground ml-1 leading-relaxed">{t("ui.git.form.webhookUrlDesc")}</p>
                                {errors.webhookUrl && <p className="text-[11px] text-destructive mt-1 ml-1">{errors.webhookUrl.message}</p>}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                            {/* Astro Firefly 预检守卫 */}
                            <div className="flex items-start space-x-2.5 rounded-lg border border-border/50 bg-muted/20 p-2.5">
                                <Checkbox
                                    id="validateFrontmatter"
                                    checked={Boolean(validateFrontmatter)}
                                    onCheckedChange={(checked) => setValue("validateFrontmatter", Boolean(checked), { shouldDirty: true, shouldValidate: true })}
                                    className="mt-0.5 border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                        <Label htmlFor="validateFrontmatter" className="text-xs font-semibold cursor-pointer">
                                            {t("ui.git.form.validateFrontmatter")}
                                        </Label>
                                        <FieldTooltip content={t("ui.git.form.validateFrontmatterTooltip")} />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-snug">
                                        {t("ui.git.form.validateFrontmatterDesc")}
                                    </p>
                                </div>
                            </div>

                            {/* 自动汇聚跨目录引用附件 */}
                            <div className="flex items-start space-x-2.5 rounded-lg border border-border/50 bg-muted/20 p-2.5">
                                <Checkbox
                                    id="bundleAssets"
                                    checked={Boolean(bundleAssets)}
                                    onCheckedChange={(checked) => setValue("bundleAssets", Boolean(checked), { shouldDirty: true, shouldValidate: true })}
                                    className="mt-0.5 border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                        <Label htmlFor="bundleAssets" className="text-xs font-semibold cursor-pointer">
                                            {t("ui.git.form.bundleAssets")}
                                        </Label>
                                        <FieldTooltip content={t("ui.git.form.bundleAssetsTooltip")} />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-snug">
                                        {t("ui.git.form.bundleAssetsDesc")}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 配置同步设置 */}
            <div className="space-y-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="includeConfig"
                            checked={Boolean(includeConfig)}
                            onCheckedChange={(checked) => setValue("includeConfig", Boolean(checked))}
                            className="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <Label htmlFor="includeConfig" className="text-sm font-semibold cursor-pointer">
                            {t("ui.git.form.includeConfig")}
                        </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("ui.git.form.includeConfigDesc")}</p>
                </div>

                {includeConfig && (
                    <div className="space-y-3 pl-6 border-l-2 border-primary/20 animate-in fade-in slide-in-from-left-2 duration-200">
                        <div className="space-y-2">
                            {fields.map((field, index) => (
                                <div key={field.id} className="flex items-center gap-2 group">
                                    <div className="relative flex-1">
                                        <Input
                                            {...register(`configSyncRules.${index}` as never)}
                                            placeholder=".obsidian/settings.json"
                                            className="bg-background border-input h-9 text-sm focus-visible:ring-1"
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                                        onClick={() => remove(index)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs border-dashed border-primary/40 hover:border-primary text-primary/80 hover:text-primary hover:bg-primary/5"
                            onClick={() => append("")}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            {t("ui.git.form.addRule")}
                        </Button>

                        {errors.configSyncRules && (
                            <p className="text-[11px] text-destructive mt-1">
                                {(errors.configSyncRules as { root?: { message?: string }; message?: string }).root?.message || (errors.configSyncRules as { message?: string }).message}
                            </p>
                        )}
                    </div>
                )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-border">
                {/* 是否启用 */}
                <div className="flex items-center space-x-2 whitespace-nowrap shrink-0">
                    <Checkbox
                        id="isEnabled"
                        name="isEnabled"
                        checked={Boolean(isEnabled)}
                        onCheckedChange={(checked) => setValue("isEnabled", Boolean(checked))}
                        className="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <Label htmlFor="isEnabled" className="text-sm font-medium text-foreground">{t("ui.common.isEnabled")}</Label>
                </div>

                <div className="flex items-center gap-3 flex-wrap justify-end">
                    {onCancel && (
                        <Button type="button" variant="ghost" onClick={handleCancel} disabled={isSubmitting || isValidating}>
                            {t("ui.common.cancel")}
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="px-6 rounded-lg"
                        disabled={isSubmitting || isValidating}
                        onClick={async () => {
                            const values = getValues()
                            if (!values.repoUrl) {
                                return
                            }
                            setIsValidating(true)
                            await handleGitSyncValidate({
                                repoUrl: values.repoUrl,
                                branch: values.branch,
                                username: values.username,
                                password: values.password,
                            }, () => { })
                            setIsValidating(false)
                        }}
                    >
                        <ShieldCheck className="h-4 w-4 mr-1.5" />
                        {isValidating ? t("ui.git.validate.loading") : t("ui.git.validate.title")}
                    </Button>
                    <Button type="submit" size="sm" className="px-8 rounded-lg shadow-sm" disabled={isSubmitting || isValidating}>
                        {config ? t("ui.common.save") : t("ui.common.add")}
                    </Button>
                </div>
            </div>
        </form>
    )
}
