#!/usr/bin/env python3
"""
Lightweight isolated SymPy runner for tianshu-research compute gateway.
Takes JSON input on stdin and outputs JSON on stdout.
"""
import sys
import json

def run():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({"ok": False, "error": "Empty input"}))
            return
        payload = json.loads(raw)
        
        try:
            import sympy as sp
        except ImportError:
            print(json.dumps({
                "ok": False,
                "available": False,
                "degraded": True,
                "reason": "sympy_not_installed",
                "error": "SymPy is not installed in the active Python environment"
            }))
            return

        action = payload.get("action", "simplify")
        expr_str = payload.get("expr", "")
        if not expr_str:
            print(json.dumps({"ok": False, "error": "expr is required"}))
            return

        # Safe parsing of mathematical expression
        expr = sp.sympify(expr_str)

        if action == "simplify":
            res = sp.simplify(expr)
            print(json.dumps({"ok": True, "result": str(res), "latex": sp.latex(res)}))
            return
        elif action == "limit":
            var_str = payload.get("var", "x")
            target = payload.get("to", "oo")
            target_val = sp.oo if str(target).lower() in ["oo", "inf", "infinity"] else sp.sympify(target)
            var = sp.Symbol(var_str)
            res = sp.limit(expr, var, target_val)
            print(json.dumps({"ok": True, "result": str(res), "latex": sp.latex(res)}))
            return
        elif action == "diff":
            var_str = payload.get("var", "x")
            var = sp.Symbol(var_str)
            res = sp.diff(expr, var)
            print(json.dumps({"ok": True, "result": str(res), "latex": sp.latex(res)}))
            return
        else:
            print(json.dumps({"ok": False, "error": f"Unsupported symbolic action: {action}"}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))

if __name__ == "__main__":
    run()

