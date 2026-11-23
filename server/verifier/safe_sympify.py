"""
safe_sympify.py - Hardened AST-validated wrapper around SymPy sympify.

Prevents arbitrary Python execution (e.g. __import__, attribute traversal,
lambda/comprehension injection) and exponential-tower DoS (e.g. 9**9**9**9)
before delegating to sympy.sympify().
"""

import ast
import math
import re
import sympy as sp
from sympy.parsing.sympy_parser import (
    stringify_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
)

MAX_EXPR_LENGTH = 4096
MAX_LITERAL_EXPONENT = 10000
MAX_AST_DEPTH = 64

FORBIDDEN_SUBSTRINGS = (
    "__",
    "`",
)

FORBIDDEN_WORD_RE = re.compile(
    r"\b(?:__import__|import|eval|exec|compile|open|getattr|setattr|delattr|"
    r"globals|locals|vars|dir|breakpoint|subprocess|popen|system|lambda|"
    r"chr|ord|type|object|input|print|memoryview|bytearray|exit|quit)\b",
    re.IGNORECASE,
)

ALLOWED_CALL_NAMES = {
    # Trig & hyperbolic
    "sin", "cos", "tan", "sec", "csc", "cot",
    "asin", "acos", "atan", "atan2", "arcsin", "arccos", "arctan",
    "asec", "acsc", "acot", "arcsec", "arccsc", "arccot",
    "sinh", "cosh", "tanh", "sech", "csch", "coth",
    "asinh", "acosh", "atanh", "arcsinh", "arccosh", "arctanh",
    # Logs, roots, powers, rounding
    "log", "ln", "log10", "log2", "exp", "sqrt", "cbrt", "root", "real_root",
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
    # Operators (bitshifts LShift/RShift intentionally excluded to block integer blowup DoS)
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.BitAnd, ast.BitOr, ast.BitXor, ast.Invert,
    ast.UAdd, ast.USub, ast.Not, ast.And, ast.Or,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
)


class UnsafeMathExpressionError(ValueError):
    """Raised when a mathematical expression violates security or resource policies."""


def _extract_numeric_constant(node: ast.AST):
    """Extracts a Python numeric value from Constant / signed Constant / Integer / Float AST nodes."""
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        inner = _extract_numeric_constant(node.operand)
        if inner is not None:
            return -inner if isinstance(node.op, ast.USub) else inner
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in {"Integer", "Float"}
        and len(node.args) == 1
        and isinstance(node.args[0], ast.Constant)
    ):
        try:
            return float(node.args[0].value)
        except Exception:
            return None
    return None


def _check_ast_node(node: ast.AST, pow_depth: int = 0, tree_depth: int = 0) -> None:
    if tree_depth > MAX_AST_DEPTH:
        raise UnsafeMathExpressionError("Expression nesting depth exceeds safe limit")

    if not isinstance(node, ALLOWED_AST_NODES):
        raise UnsafeMathExpressionError(f"Disallowed AST construct: {type(node).__name__}")

    if isinstance(node, ast.Constant):
        if isinstance(node.value, str):
            # Allow Symbol('x') / Function('sin') strings only inside SymPy parser AST if checked at Call below;
            # raw expression constants must never be string literals.
            raise UnsafeMathExpressionError("String literals are not permitted in math expressions")
        if isinstance(node.value, (int, float)):
            if not math.isfinite(float(node.value)) or abs(node.value) > 1e300:
                raise UnsafeMathExpressionError("Numeric literal exceeds safe magnitude")

    if isinstance(node, ast.Name):
        if node.id.startswith("_") or node.id.lower() in {
            "eval", "exec", "open", "compile", "chr", "ord", "type", "object",
            "getattr", "setattr", "delattr", "globals", "locals", "vars", "dir",
            "input", "print", "memoryview", "bytearray", "breakpoint", "import",
        }:
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
        fn_id = node.func.id
        # Bound factorial(n) on large constant arguments to prevent CPU DoS
        if fn_id == "factorial" and len(node.args) == 1:
            num_arg = _extract_numeric_constant(node.args[0])
            if num_arg is not None and abs(num_arg) > 500:
                raise UnsafeMathExpressionError("Factorial argument exceeds safe resource limit")
        # SymPy stringify_expr produces Symbol('x'), Function('sin'), Integer(2), Float('1.5')
        if fn_id in {"Symbol", "Function", "Integer", "Float"}:
            if len(node.args) != 1 or not isinstance(node.args[0], ast.Constant):
                raise UnsafeMathExpressionError(f"Invalid constructor arguments for {fn_id}")
            arg_val = node.args[0].value
            if fn_id in {"Symbol", "Function"}:
                if not isinstance(arg_val, str) or FORBIDDEN_WORD_RE.search(arg_val) or "__" in arg_val:
                    raise UnsafeMathExpressionError(f"Disallowed symbolic name: {arg_val}")
                if fn_id == "Function" and arg_val not in ALLOWED_CALL_NAMES:
                    raise UnsafeMathExpressionError(f"Disallowed function call: {arg_val}")
            else:
                # Integer(n) / Float('1.5')
                try:
                    num_v = float(arg_val)
                    if not math.isfinite(num_v) or abs(num_v) > 1e300:
                        raise UnsafeMathExpressionError("Numeric literal exceeds safe magnitude")
                except UnsafeMathExpressionError:
                    raise
                except Exception:
                    raise UnsafeMathExpressionError("Malformed numeric constructor literal")
            for kw in node.keywords:
                _check_ast_node(kw.value, pow_depth, tree_depth + 1)
            return

    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
        next_depth = pow_depth + 1
        right_num = _extract_numeric_constant(node.right)
        left_num = _extract_numeric_constant(node.left)
        # Reject right-associated numeric power towers like 9**9**9 or 2**3**100 immediately
        if isinstance(node.right, ast.BinOp) and isinstance(node.right.op, ast.Pow):
            if left_num is not None and abs(left_num) > 1:
                raise UnsafeMathExpressionError("Nested numeric power tower rejected (resource limit)")
        # Reject left-associated numeric power blowups like (10**10000)**10000
        if isinstance(node.left, ast.BinOp) and isinstance(node.left.op, ast.Pow):
            inner_left = _extract_numeric_constant(node.left.left)
            inner_right = _extract_numeric_constant(node.left.right)
            if inner_left is not None and inner_right is not None and right_num is not None:
                if abs(inner_left) > 1 and abs(inner_right * right_num) > MAX_LITERAL_EXPONENT:
                    raise UnsafeMathExpressionError("Compound power tower exceeds safe resource limit")
        # Guard against exponential towers >= 3 deep
        if next_depth >= 3 and left_num is not None:
            raise UnsafeMathExpressionError("Nested numeric power tower rejected (resource limit)")
        if right_num is not None and abs(right_num) > MAX_LITERAL_EXPONENT:
            raise UnsafeMathExpressionError("Literal exponent exceeds safe resource limit")
        _check_ast_node(node.left, next_depth, tree_depth + 1)
        _check_ast_node(node.right, next_depth, tree_depth + 1)
        return

    for child in ast.iter_child_nodes(node):
        _check_ast_node(child, pow_depth, tree_depth + 1)


def _validate_sympy_stringify(expr_str: str) -> None:
    """
    Runs SymPy's tokenizer/stringify_expr on candidate math strings that aren't valid raw Python syntax
    (e.g. postfix factorial `0!` or implicit multiplication `2x`), then inspects the resulting Python AST.
    Never allows SyntaxError to bypass AST inspection.
    """
    last_err = None
    for transforms in (
        standard_transformations + (convert_xor,),
        standard_transformations + (implicit_multiplication_application, convert_xor),
    ):
        try:
            py_code = stringify_expr(expr_str, {}, {}, transforms)
            tree = ast.parse(py_code, mode="eval")
            _check_ast_node(tree)
            return
        except UnsafeMathExpressionError:
            raise
        except Exception as err:
            last_err = err
    raise UnsafeMathExpressionError(f"Unparseable or unsafe mathematical expression ({last_err})")


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

    word_match = FORBIDDEN_WORD_RE.search(expr_str)
    if word_match:
        raise UnsafeMathExpressionError(f"Forbidden token in expression: {word_match.group(0)}")

    # Block quotes/semicolons upfront even before tokenization
    if re.search(r'["\';]', expr_str) or re.search(r'(?<!\d)\.[a-zA-Z_]', expr_str):
        raise UnsafeMathExpressionError("Unsafe syntax token in math expression")

    # Reject malformed consecutive binary division/multiplication operators (e.g. "1 / / 2")
    if re.search(r'/\s*/', expr_str):
        raise UnsafeMathExpressionError("Malformed consecutive division operators")

    # Normalize caret to ** for AST inspection when expression is Python-parseable
    candidate = expr_str.replace("^", "**")
    try:
        tree = ast.parse(candidate, mode="eval")
        _check_ast_node(tree)
    except SyntaxError:
        _validate_sympy_stringify(expr_str)

    return expr_str


def validate_payload_strings(obj, depth: int = 0) -> None:
    """Recursively validates string fields in a JSON payload against security policies."""
    if depth > 12:
        raise UnsafeMathExpressionError("Payload nesting depth exceeded")
    if isinstance(obj, str):
        if len(obj) > MAX_EXPR_LENGTH * 2:
            raise UnsafeMathExpressionError("Payload string exceeds maximum allowed length")
        lower = obj.lower()
        for bad in ("__", "__import__", "subprocess"):
            if bad in lower:
                raise UnsafeMathExpressionError(f"Forbidden token in payload: {bad}")
        if re.search(r'\b(?:eval|exec|compile|open|popen)\s*\(', obj, re.IGNORECASE):
            raise UnsafeMathExpressionError("Forbidden call pattern in payload")
        if re.search(r'(?<!\d)\.[a-zA-Z_][a-zA-Z0-9_]*', obj):
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
