export function adminUserCreditConfirm(role: "admin" | "superadmin", current: number, next: number) {
    if (role === "superadmin") return `将用户算力点调整为 ${next}，并记录后台调整流水。确认继续？`;
    const difference = next - current;
    if (difference > 0) return `将向用户转移 ${difference} 算力点，并从你的余额中扣除。确认继续？`;
    if (difference < 0) return `将从用户收回 ${Math.abs(difference)} 算力点，并返还到你的余额。确认继续？`;
    return "用户算力点没有变化。";
}
