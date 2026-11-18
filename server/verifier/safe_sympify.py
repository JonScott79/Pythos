"""
safe_sympify.py - Hardened AST-validated wrapper around SymPy sympify.

Prevents arbitrary Python execution (e.g. __import__, attribute traversal,
lambda/comprehension injection) and exponential-tower DoS (e.g. 9**9**9**9)
before delegating to sympy.sympify().
"""

import ast
import re
import sympy as sp

MAX_EXPR_LENGTH = 4096
MAX_LITERAL_EXPONENT = 10000

FORBIDDEN_SUBSTRINGS = (
    "__",
    "import",
    "exec(",
    "eval(",
    "compile(",
    "open(",
    "getattr",
    "setattr",
    "delattr",
    "globals",
    "locals",
    "vars(",
    "dir(",
    "breakpoint",
    "subprocess",
    "popen",
    "system(",
    "lambda",
    "`",
)

ALLOWED_CALL_NAMES = {
    # Trig & hyperbolic
    "sin", "cos", "tan", "sec", "csc", "cot",
    "asin", "acos", "atan", "atan2", "arcsin", "arccos", "arctan",
    "asec", "acsc", "acot", "arcsec", "arccsc", "arccot",
    "sinh", "cosh", "tanh", "sech", "csch", "coth",
    "asinh", "acosh", "atanh", "arcsinh", "arccosh", "arctanh",
    # Logs, roots, powers, rounding
    "log", "ln", "log10", "log2", "exp", "sqrt", "cbrt", "root",
    "Abs", "abs", "sign", "floor", "ceiling", "ceil", "round",
    "Mod", "factorial", "gamma", "binomial",
    # SymPy constructors / algebra / logic
    "Rational", "Integer", "Float", "Symbol", "Symbols", "Function",
    "Eq", "Ne", "Lt", "Le", "Gt", "Ge",
    "And", "Or", "Not", "Xor", "Nand", "Nor", "Implies", "Equivalent",
    "Piecewise", "Matrix", "det", "simplify", "expand", "factor",
    "Min", "Max", "min", "max", "Sum", "Product", "Integral", "Derivative", "Limit",
    # Symbolic single-letter math functions (e.g. f(x), g(u))
    "f", "g", "h", "p", "q", "r", "P", "Q", "R", "F", "G", "H", "y", "u", "v",
}

ALLOWED_AST_NODES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.BoolOp,
    ast.Compare,
    ast.Name,
    ast.Load,
    ast.Constant,
    ast.Call,
    ast.List,
    ast.Tuple,
    # Operators
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.BitAnd, ast.BitOr, ast.BitXor, ast.Invert, ast.RShift, ast.LShift,
    ast.UAdd, ast.USub, ast.Not, ast.And, ast.Or,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
)


class UnsafeMathExpressionError(ValueError):
    """Raised when a mathematical expression violates security or resource policies."""


def _check_ast_node(node: ast.AST, pow_depth: int = 0) -> None:
    if not isinstance(node, ALLOWED_AST_NODES):
        raise UnsafeMathExpressionError(f"Disallowed AST construct: {type(node).__name__}")

    if isinstance(node, ast.Constant):
        if isinstance(node.value, str):
            raise UnsafeMathExpressionError("String literals are not permitted in math expressions")
        if isinstance(node.value, (int, float)) and abs(node.value) > 1e300:
            raise UnsafeMathExpressionError("Numeric literal exceeds safe magnitude")

    if isinstance(node, ast.Name):
        if node.id.startswith("_") or node.id in {"eval", "exec", "open", "compile", "chr", "ord", "type", "object"}:
            raise UnsafeMathExpressionError(f"Disallowed identifier: {node.id}")

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in ALLOWED_CALL_NAMES:
            fn_name = getattr(node.func, "id", type(node.func).__name__)
            raise UnsafeMathExpressionError(f"Disallowed function call: {fn_name}")
        if node.keywords:
            # Allow only safe SymPy keyword flags like evaluate=False
            for kw in node.keywords:
                if kw.arg not in {"evaluate", "real"}:
                    raise UnsafeMathExpressionError(f"Disallowed keyword argument: {kw.arg}")

    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
        next_depth = pow_depth + 1
        # Guard against exponential towers like 9**9**9**9
        if next_depth >= 3 and isinstance(node.left, ast.Constant) and isinstance(node.right, (ast.BinOp, ast.Constant)):
            raise UnsafeMathExpressionError("Nested numeric power tower rejected (resource limit)")
        if isinstance(node.right, ast.Constant) and isinstance(node.right.value, (int, float)):
            if abs(node.right.value) > MAX_LITERAL_EXPONENT:
                raise UnsafeMathExpressionError("Literal exponent exceeds safe resource limit")
        _check_ast_node(node.left, next_depth)
        _check_ast_node(node.right, next_depth)
        return

    for child in ast.iter_child_nodes(node):
        _check_ast_node(child, pow_depth)


def validate_math_expression(expr_str: str) -> str:
    """
    Validates an expression string for length, forbidden tokens, and safe AST structure.
    Returns the validated string or raises UnsafeMathExpressionError.
    """
    if not isinstance(expr_str, str):
        raise UnsafeMathExpressionError("Expression must be a string")
    if len(expr_str) > MAX_EXPR_LENGTH:
        raise UnsafeMathExpressionError(f"Expression length exceeds {MAX_EXPR_LENGTH} chars")

    lower = expr_str.lower()
    for bad in FORBIDDEN_SUBSTRINGS:
        if bad in lower:
            raise UnsafeMathExpressionError(f"Forbidden token in expression: {bad}")

    # Normalize caret to ** for AST inspection when expression is Python-parseable
    candidate = expr_str.replace("^", "**")
    try:
        tree = ast.parse(candidate, mode="eval")
        _check_ast_node(tree)
    except SyntaxError:
        # Non-Python math syntax (e.g. implicit multiplication 2x) may still be parsed by SymPy
        # after normalization; block quotes/attribute dots/brackets that aren't numeric decimals
        if re.search(r'["\';]', expr_str) or re.search(r'(?<!\d)\.[a-zA-Z_]', expr_str):
            raise UnsafeMathExpressionError("Unsafe syntax token in non-Python math expression")

    return expr_str


def validate_payload_strings(obj, depth: int = 0) -> None:
    """Recursively validates string fields in a JSON payload against security policies."""
    if depth > 12:
        raise UnsafeMathExpressionError("Payload nesting depth exceeded")
    if isinstance(obj, str):
        if len(obj) > MAX_EXPR_LENGTH * 2:
            raise UnsafeMathExpressionError("Payload string exceeds maximum allowed length")
        lower = obj.lower()
        for bad in ("__", "import(", "__import__", "exec(", "eval(", "compile(", "subprocess", "popen("):
            if bad in lower:
                raise UnsafeMathExpressionError(f"Forbidden token in payload: {bad}")
        if re.search(r'(?<!\d)\.[a-zA-Z_][a-zA-Z0-9_]*', obj):
            # Allow prose sentences or URLs? Only flag obvious Python attribute chains like .__class__ or os.system
            if re.search(r'\b(?:os|sys|subprocess|builtins)\.[a-zA-Z_]+|\)\.[a-zA-Z_]+', obj):
                raise UnsafeMathExpressionError("Forbidden Python attribute traversal in payload")
    elif isinstance(obj, dict):
        for v in obj.values():
            validate_payload_strings(v, depth + 1)
    elif isinstance(obj, list):
        for item in obj:
            validate_payload_strings(item, depth + 1)


def safe_sympify(expr_str: str, **kwargs):
    """AST-validated wrapper around sympy.sympify."""
    validated = validate_math_expression(str(expr_str))
    return sp.sympify(validated, **kwargs)
