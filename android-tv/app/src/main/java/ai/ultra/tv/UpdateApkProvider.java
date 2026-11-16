package ai.ultra.tv;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Read-only provider for precisely one downloaded and verified update APK.
 * The package installer gets access only after a user-initiated action with
 * FLAG_GRANT_READ_URI_PERMISSION. No arbitrary paths are accepted.
 */
public final class UpdateApkProvider extends ContentProvider {
    public static final String AUTHORITY = "ai.ultra.tv.updatefile";
    public static final Uri UPDATE_URI =
            Uri.parse("content://" + AUTHORITY + "/ultra-tv-update.apk");

    @Override
    public boolean onCreate() { return true; }

    private File verifiedFile(Uri uri) throws FileNotFoundException {
        if (!UPDATE_URI.equals(uri) || getContext() == null)
            throw new FileNotFoundException("Unsupported content URI");
        File file = new File(new File(getContext().getCacheDir(), "updates"), "ultra-tv-update.apk");
        if (!file.isFile() || file.length() < 10000L)
            throw new FileNotFoundException("Update not downloaded");
        return file;
    }

    @Override
    public String getType(Uri uri) {
        if (!UPDATE_URI.equals(uri)) return null;
        return "application/vnd.android.package-archive";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        try {
            File file = verifiedFile(uri);
            String[] columns = projection == null ?
                    new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
            MatrixCursor cursor = new MatrixCursor(columns, 1);
            Object[] values = new Object[columns.length];
            for (int i = 0; i < columns.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i] = "Ultra-TV-AI-update.apk";
                else if (OpenableColumns.SIZE.equals(columns[i])) values[i] = file.length();
            }
            cursor.addRow(values);
            return cursor;
        } catch (FileNotFoundException ignored) {
            return null;
        }
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Read-only update provider");
        return ParcelFileDescriptor.open(verifiedFile(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException();
    }
    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException();
    }
}
