import os
import logging
import httpx
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ConversationHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters,
)

# --- 설정 ---
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ALLOWED_USER_IDS = set(
    int(uid) for uid in os.environ.get("ALLOWED_USER_IDS", "").split(",") if uid.strip()
)
API_SERVER_URL = os.environ.get("API_SERVER_URL", "http://localhost:8000")
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "")
PORT = int(os.environ.get("PORT", 8080))

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# ConversationHandler 상태값
SEARCH_REGION, SEARCH_AMOUNT, SEARCH_PROPERTY_TYPE = range(3)


# --- 사용자 인증 데코레이터 ---
def require_auth(func):
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_id = update.effective_user.id
        if ALLOWED_USER_IDS and user_id not in ALLOWED_USER_IDS:
            await update.message.reply_text("⛔ 인증된 사용자만 접근 가능합니다.")
            logger.warning(f"Unauthorized access attempt by user_id={user_id}")
            return
        return await func(update, context)
    wrapper.__name__ = func.__name__
    return wrapper


# --- /start 명령어 ---
@require_auth
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_name = update.effective_user.first_name
    keyboard = [
        [
            InlineKeyboardButton("🔍 물건 검색", callback_data="menu_search"),
            InlineKeyboardButton("📊 상태 확인", callback_data="menu_status"),
        ],
        [
            InlineKeyboardButton("🔔 감시 시작", callback_data="menu_alert"),
            InlineKeyboardButton("💰 수익 계산", callback_data="menu_calc"),
        ],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        f"🏛️ *Project Sentinel Alpha*에 오신 것을 환영합니다, {user_name}님\\!\n\n"
        "자율 경매 분석 에이전트가 대기 중입니다\\.\n"
        "아래 메뉴를 선택하거나 명령어를 입력하세요:\n\n"
        "`/search` \\- 맞춤 물건 검색\n"
        "`/report [사건번호]` \\- 특정 물건 심층 분석\n"
        "`/alert_on [조건]` \\- 실시간 감시 시작\n"
        "`/status` \\- 시스템 상태 확인\n"
        "`/cancel` \\- 진행 중인 명령 취소",
        parse_mode="MarkdownV2",
        reply_markup=reply_markup,
    )


# --- /search 대화형 흐름 ---
@require_auth
async def search_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if args and len(args) >= 2:
        context.user_data["region"] = args[0]
        try:
            amount_eok = float(args[1].replace("억", ""))
            context.user_data["amount"] = int(amount_eok * 100_000_000)
        except ValueError:
            context.user_data["amount"] = 500_000_000
        context.user_data["property_type"] = "ALL"
        await execute_search(update.message, context)
        return ConversationHandler.END

    await update.message.reply_text(
        "🔍 *물건 검색을 시작합니다\\.*\n\n"
        "검색할 지역을 입력하세요\\.\n"
        "예시: `울산`, `부산 해운대구`, `서울 강남구`\n\n"
        "취소하려면 `/cancel` 을 입력하세요\\.",
        parse_mode="MarkdownV2",
    )
    return SEARCH_REGION


async def search_get_region(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["region"] = update.message.text.strip()
    region_escaped = context.user_data["region"].replace("-", "\\-").replace(".", "\\.")
    await update.message.reply_text(
        f"📍 지역: *{region_escaped}*\n\n"
        "최대 금액을 입력하세요 \\(억 단위\\)\\.\n"
        "예시: `3` \\(3억 이하\\), `5` \\(5억 이하\\)",
        parse_mode="MarkdownV2",
    )
    return SEARCH_AMOUNT


async def search_get_amount(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        amount_eok = float(update.message.text.strip().replace("억", ""))
        context.user_data["amount"] = int(amount_eok * 100_000_000)
    except ValueError:
        await update.message.reply_text("⚠️ 올바른 금액을 입력해주세요. 예: `3` (3억)")
        return SEARCH_AMOUNT

    keyboard = [
        [
            InlineKeyboardButton("🏠 아파트", callback_data="type_APARTMENT"),
            InlineKeyboardButton("🏡 주택", callback_data="type_HOUSE"),
        ],
        [
            InlineKeyboardButton("🏪 상가", callback_data="type_COMMERCIAL"),
            InlineKeyboardButton("🌿 토지", callback_data="type_LAND"),
        ],
        [InlineKeyboardButton("📋 전체", callback_data="type_ALL")],
    ]
    amount_eok_display = context.user_data["amount"] / 100_000_000
    await update.message.reply_text(
        f"💰 최대 금액: *{amount_eok_display:.1f}억*\n\n물건 종류를 선택하세요:",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    return SEARCH_PROPERTY_TYPE


async def search_get_type(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    property_type = query.data.replace("type_", "")
    context.user_data["property_type"] = property_type
    await query.edit_message_text("⏳ 분석 에이전트 가동 중...")
    await execute_search(query, context)
    return ConversationHandler.END


async def execute_search(target, context: ContextTypes.DEFAULT_TYPE):
    region = context.user_data.get("region", "")
    amount = context.user_data.get("amount", 500_000_000)
    property_type = context.user_data.get("property_type", "ALL")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{API_SERVER_URL}/auctions",
                params={
                    "region": region,
                    "max_price": amount,
                    "property_type": property_type,
                    "risk_filter": True,
                    "limit": 5,
                },
            )
            data = response.json()
            items = data.get("items", [])
            total = data.get("total", 0)
    except Exception as e:
        logger.warning(f"API 호출 실패 (개발 중): {e}")
        items = []
        total = 0

    amount_eok = amount / 100_000_000
    if not items:
        msg = (
            f"🔍 *검색 결과*\n"
            f"지역: {region} | 최대: {amount_eok:.1f}억\n\n"
            f"조건에 맞는 안전한 물건이 없습니다.\n\n"
            f"_※ API 서버 연동 후 실제 데이터가 표시됩니다._"
        )
    else:
        lines = [f"🏛️ *검색 결과* \\- {region} \\({total}건 중 상위 {len(items)}건\\)\n"]
        for i, item in enumerate(items, 1):
            risk_score = item.get("risk_score", 0)
            if risk_score < 30:
                risk_emoji = "🟢"
            elif risk_score < 60:
                risk_emoji = "🟡"
            else:
                risk_emoji = "🔴"
            bid = item.get("minimum_bid", 0) // 10000
            discount = item.get("discount_rate", 0)
            yield_rate = item.get("yield_rate", 0)
            case_num = item.get("case_number", "-")
            addr = item.get("address", "주소 없음")
            lines.append(
                f"{risk_emoji} *{i}\\. {addr}*\n"
                f"   최저가: {bid:,}만원 \\| 감정가 대비: {discount:.1f}%\n"
                f"   예상수익률: {yield_rate:.1f}% \\| 사건번호: `{case_num}`\n"
            )
        lines.append("\n상세 분석: `/report 사건번호`")
        msg = "\n".join(lines)

    if hasattr(target, "edit_message_text"):
        await target.edit_message_text(msg, parse_mode="MarkdownV2")
    else:
        await target.reply_text(msg, parse_mode="Markdown")


async def search_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.message.reply_text("❌ 검색이 취소되었습니다.")
    return ConversationHandler.END


# --- /status 명령어 ---
@require_auth
async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{API_SERVER_URL}/health")
            health_data = response.json()
            api_status = "🟢 정상"
    except Exception:
        health_data = {}
        api_status = "🔴 오프라인 (API 서버 미연결)"

    db_status = "🟢 연결됨" if health_data.get("db") else "🔴 미연결"
    scraper_status = "🟢 가동 중" if health_data.get("scraper") else "🟡 대기 중"
    last_update = health_data.get("last_update", "알 수 없음")

    msg = (
        "📊 *시스템 상태 보고*\n\n"
        f"🤖 Telegram Bot: 🟢 정상\n"
        f"⚙️ API 서버: {api_status}\n"
        f"🗄️ 데이터베이스: {db_status}\n"
        f"📡 스크래퍼: {scraper_status}\n\n"
        f"마지막 업데이트: {last_update}"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")


# --- /report 명령어 ---
@require_auth
async def report_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text(
            "⚠️ 사건번호를 입력하세요.\n예: `/report 2023타단12345`",
            parse_mode="Markdown",
        )
        return

    case_number = context.args[0]
    msg = await update.message.reply_text(
        f"📋 `{case_number}` 심층 분석 중...", parse_mode="Markdown"
    )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(f"{API_SERVER_URL}/report/{case_number}")
            report = response.json()
    except Exception as e:
        logger.warning(f"리포트 API 호출 실패: {e}")
        await msg.edit_text(
            f"⚠️ 리포트 생성 실패: API 서버 미연결\n_사건번호: {case_number}_",
            parse_mode="Markdown",
        )
        return

    risk_items = report.get("risk_items", [])
    risk_section = "\n".join([f"   ⚠️ {r}" for r in risk_items]) or "   ✅ 특이사항 없음"
    appraisal = report.get("appraisal_value", 0) // 10000
    min_bid = report.get("minimum_bid", 0) // 10000
    profit = report.get("expected_profit", 0) // 10000

    result_msg = (
        f"📋 *심층 분석 리포트*\n"
        f"사건번호: `{case_number}`\n\n"
        f"🏠 *물건 정보*\n"
        f"   주소: {report.get('address', '-')}\n"
        f"   면적: {report.get('area', '-')}㎡\n"
        f"   감정가: {appraisal:,}만원\n"
        f"   최저가: {min_bid:,}만원\n\n"
        f"⚖️ *권리 분석*\n{risk_section}\n\n"
        f"💰 *수익성 분석*\n"
        f"   예상 차익: {profit:,}만원\n"
        f"   수익률: {report.get('profit_rate', 0):.1f}%\n"
        f"   종합 점수: {report.get('overall_score', '-')}/100"
    )
    await msg.edit_text(result_msg, parse_mode="Markdown")


# --- /alert_on 명령어 ---
@require_auth
async def alert_on_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text(
            "⚠️ 감시 조건을 입력하세요.\n"
            "예: `/alert_on 부산 해운대구 5억이하 아파트`",
            parse_mode="Markdown",
        )
        return

    condition = " ".join(context.args)
    user_id = update.effective_user.id
    logger.info(f"Alert registered: user={user_id}, condition={condition}")

    await update.message.reply_text(
        f"🔔 *실시간 감시 시작*\n\n"
        f"조건: `{condition}`\n"
        f"조건에 맞는 물건 등장 시 즉시 알림을 드립니다.\n\n"
        f"_※ 감시 중지: `/alert_off`_\n"
        f"_※ 현재 개발 중 - API 서버 연동 후 활성화됩니다._",
        parse_mode="Markdown",
    )


# --- /alert_off 명령어 ---
@require_auth
async def alert_off_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🔕 *실시간 감시 중지*\n\n모든 감시 조건이 해제되었습니다.",
        parse_mode="Markdown",
    )


# --- 인라인 버튼 콜백 ---
async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.data == "menu_status":
        await query.edit_message_text("⏳ 시스템 상태 확인 중...")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{API_SERVER_URL}/health")
                health_data = response.json()
                api_status = "🟢 정상"
        except Exception:
            health_data = {}
            api_status = "🔴 오프라인"
        msg = (
            "📊 *시스템 상태 보고*\n\n"
            f"🤖 Telegram Bot: 🟢 정상\n"
            f"⚙️ API 서버: {api_status}\n"
            f"🗄️ 데이터베이스: {'🟢 연결됨' if health_data.get('db') else '🔴 미연결'}\n"
            f"📡 스크래퍼: {'🟢 가동 중' if health_data.get('scraper') else '🟡 대기 중'}"
        )
        await query.edit_message_text(msg, parse_mode="Markdown")

    elif query.data == "menu_search":
        await query.edit_message_text(
            "🔍 검색 명령어를 입력하세요:\n\n"
            "`/search` \\- 대화형 검색 시작\n"
            "`/search 울산 3` \\- 울산 3억 이하 즉시 검색",
            parse_mode="MarkdownV2",
        )
    elif query.data == "menu_alert":
        await query.edit_message_text(
            "🔔 감시 조건을 설정하세요:\n\n"
            "예: `/alert_on 부산 해운대구 5억이하 아파트`",
            parse_mode="Markdown",
        )
    elif query.data == "menu_calc":
        await query.edit_message_text(
            "💰 수익 계산기는 웹 대시보드를 이용하세요:\n"
            "https://your\\-app\\.web\\.app/calculator",
            parse_mode="MarkdownV2",
        )


# --- 자연어 처리 ---
@require_auth
async def natural_language_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.strip()

    keywords_search = ["찾아줘", "검색", "골라줘", "리스트업", "알려줘", "추천", "보여줘"]
    keywords_status = ["상태", "작동", "서버", "살아있어", "확인"]
    keywords_report = ["분석", "조사", "리포트", "위험", "권리"]

    if any(kw in text for kw in keywords_search):
        await update.message.reply_text(
            "🔍 검색 의도를 감지했습니다.\n\n"
            "`/search` 로 대화형 검색을 시작하거나,\n"
            "`/search 지역 금액` 형태로 빠르게 검색하세요.\n\n"
            "_예: `/search 부산해운대구 5`_",
            parse_mode="Markdown",
        )
    elif any(kw in text for kw in keywords_status):
        await status_command(update, context)
    elif any(kw in text for kw in keywords_report):
        await update.message.reply_text(
            "📋 심층 분석을 원하시면 사건번호를 입력하세요.\n"
            "_예: `/report 2023타단12345`_",
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text(
            "❓ 명령을 이해하지 못했습니다.\n`/start` 로 메뉴를 확인하세요."
        )


# --- 에러 핸들러 ---
async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE):
    logger.error(f"Update {update} caused error: {context.error}")


# --- 앱 구성 ---
def create_app() -> Application:
    if not BOT_TOKEN:
        raise ValueError("TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다.")

    app = Application.builder().token(BOT_TOKEN).build()

    search_conv = ConversationHandler(
        entry_points=[CommandHandler("search", search_command)],
        states={
            SEARCH_REGION: [MessageHandler(filters.TEXT & ~filters.COMMAND, search_get_region)],
            SEARCH_AMOUNT: [MessageHandler(filters.TEXT & ~filters.COMMAND, search_get_amount)],
            SEARCH_PROPERTY_TYPE: [CallbackQueryHandler(search_get_type, pattern="^type_")],
        },
        fallbacks=[CommandHandler("cancel", search_cancel)],
        conversation_timeout=300,
    )

    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("status", status_command))
    app.add_handler(CommandHandler("report", report_command))
    app.add_handler(CommandHandler("alert_on", alert_on_command))
    app.add_handler(CommandHandler("alert_off", alert_off_command))
    app.add_handler(search_conv)
    app.add_handler(CallbackQueryHandler(button_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, natural_language_handler))
    app.add_error_handler(error_handler)

    return app


def main():
    app = create_app()

    if WEBHOOK_URL:
        logger.info(f"Webhook 모드 시작: port={PORT}, url={WEBHOOK_URL}")
        app.run_webhook(
            listen="0.0.0.0",
            port=PORT,
            webhook_url=f"{WEBHOOK_URL}/webhook",
            url_path="webhook",
        )
    else:
        logger.info("Polling 모드 시작 (로컬 개발 환경)")
        app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
