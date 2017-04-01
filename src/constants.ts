"use strict";

export namespace Commands {
    export const ApplySingleFix = "casl2-lint.applySingleFix";
    export const ApplyAllSameRuleFixes = "casl2-lint.applyAllSameRuleFixes";
    export const ApplyAllFixes = "casl2-lint.applyAllFixes";
}

export namespace Messages {
    export const CannotApplyFixBecauseOfFileChange = "ファイルが変更されたため，casl2-lintの修正を適用できません。";
    export const FailedToApplyFix = "casl2-lintの修正の適用に失敗しました。";
}
