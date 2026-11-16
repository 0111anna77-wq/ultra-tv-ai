package ai.ultra.tv;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

/**
 * TV remote cursor painted by Android itself, above WebView and HTML5 fullscreen.
 * Rendering is independent of cross-origin iframe focus/visibility.
 */
public final class TvPointerOverlay extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private float x = .5f, y = .5f;
    private long pressedAt = 0;
    private final float density;

    public TvPointerOverlay(Context context) {
        super(context);
        density = context.getResources().getDisplayMetrics().density;
        setFocusable(false);
        setClickable(false);
        setWillNotDraw(false);
    }

    public void position(float px, float py) {
        x = Math.max(.02f, Math.min(.98f, px));
        y = Math.max(.02f, Math.min(.98f, py));
        invalidate();
    }

    public float getRelativeX() { return x; }
    public float getRelativeY() { return y; }
    public void clicked() {
        pressedAt = android.os.SystemClock.uptimeMillis();
        invalidate();
        postDelayed(this::invalidate, 210);
    }

    private float dp(float value) { return value * density; }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        final float cx = x * getWidth(), cy = y * getHeight();
        final boolean click = android.os.SystemClock.uptimeMillis() - pressedAt < 190L;

        // A dark outline keeps the bright crosshair legible over white video frames.
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(dp(6));
        paint.setColor(0xff05080c);
        canvas.drawCircle(cx, cy, dp(click ? 21 : 16), paint);
        paint.setStrokeWidth(dp(3));
        paint.setColor(click ? 0xff82f5bf : 0xffffd68c);
        canvas.drawCircle(cx, cy, dp(click ? 21 : 16), paint);
        paint.setStrokeWidth(dp(2.5f));
        canvas.drawLine(cx-dp(27), cy, cx-dp(19), cy, paint);
        canvas.drawLine(cx+dp(19), cy, cx+dp(27), cy, paint);
        canvas.drawLine(cx, cy-dp(27), cx, cy-dp(19), paint);
        canvas.drawLine(cx, cy+dp(19), cx, cy+dp(27), paint);

        // Fixed-size, unobtrusive legend; always visible in native fullscreen.
        final String legend = "УКАЗАТЕЛЬ   ◀ ▲ ▼ ▶  ДВИГАТЬ     OK  НАЖАТЬ     НАЗАД  ВЫХОД";
        paint.setTextSize(dp(13));
        paint.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
        float width = paint.measureText(legend);
        float left = dp(14), top = dp(16), h = dp(45);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(0xe507111b);
        canvas.drawRoundRect(new RectF(left, top, Math.min(getWidth()-dp(8), left+width+dp(24)), top+h), dp(10), dp(10), paint);
        paint.setColor(0xffffdfad);
        canvas.drawText(legend, left+dp(12), top+dp(29), paint);
    }
}
