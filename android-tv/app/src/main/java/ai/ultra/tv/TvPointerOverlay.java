package ai.ultra.tv;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

/**
 * Native remote pointer that stays above fullscreen WebView video.
 * It fades out during playback and reappears immediately on movement or OK.
 * No persistent menu, controls, or labels are drawn over the picture.
 */
public final class TvPointerOverlay extends View {
    private static final long IDLE_DELAY_MS = 2700L;
    private static final long FADE_MS = 300L;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float density;
    private float x = .5f, y = .5f;
    private long pressedAt;

    public TvPointerOverlay(Context context) {
        super(context);
        density = context.getResources().getDisplayMetrics().density;
        setFocusable(false);
        setClickable(false);
        setWillNotDraw(false);
    }

    private void displayBriefly() {
        animate().cancel();
        setAlpha(1f);
        animate().alpha(0f).setStartDelay(IDLE_DELAY_MS).setDuration(FADE_MS).start();
    }

    @Override
    public void onVisibilityChanged(View changedView, int visibility) {
        super.onVisibilityChanged(changedView, visibility);
        if (changedView == this && visibility == VISIBLE) displayBriefly();
        else if (changedView == this) animate().cancel();
    }

    public void position(float px, float py) {
        x = Math.max(.02f, Math.min(.98f, px));
        y = Math.max(.02f, Math.min(.98f, py));
        displayBriefly();
        invalidate();
    }

    public float getRelativeX() { return x; }
    public float getRelativeY() { return y; }
    public boolean isCursorVisible() { return getAlpha() > .06f; }
    public void reveal() { displayBriefly(); invalidate(); }

    public void clicked() {
        pressedAt = android.os.SystemClock.uptimeMillis();
        displayBriefly();
        invalidate();
        postDelayed(this::invalidate, 220L);
    }

    private float dp(float value) { return value * density; }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        final float cx = x * getWidth(), cy = y * getHeight();
        final boolean click = android.os.SystemClock.uptimeMillis() - pressedAt < 190L;

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
    }
}
