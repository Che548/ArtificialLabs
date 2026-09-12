package sfera.qa;

import com.android.uiautomator.core.Configurator;
import com.android.uiautomator.testrunner.UiAutomatorTestCase;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import android.os.Bundle;
import android.os.Environment;
import android.os.SystemClock;
import android.util.Base64;

/** Disposable QA instrumentation only. Snapshot animated UI without demanding
 * that the whole application become idle; the host still waits for selectors. */
public class NativeUiDump extends UiAutomatorTestCase {
    public void testSnapshot() throws Exception {
        Configurator config = Configurator.getInstance();
        long original = config.getWaitForIdleTimeout();
        // The shell runner relocates ANDROID_DATA. Match UiDevice's exact
        // destination instead of assuming Environment.getDataDirectory()=/data.
        File folder = new File(Environment.getDataDirectory(), "local/tmp");
        File file = new File(folder, "sfera-document-ui.xml");
        try {
            assertTrue("Cannot prepare native QA snapshot folder", folder.isDirectory() || folder.mkdirs());
            if (file.exists()) assertTrue("Cannot remove stale QA snapshot", file.delete());
            config.setWaitForIdleTimeout(0);
            getUiDevice().setCompressedLayoutHeirarchy(true);
            // A newly connected accessibility bridge can initially have no
            // active root. Await a real snapshot, not global animation idleness.
            long deadline = SystemClock.uptimeMillis() + 10000;
            do {
                getUiDevice().dumpWindowHierarchy("sfera-document-ui.xml");
                if (file.length() > 0) break;
                SystemClock.sleep(200);
            } while (SystemClock.uptimeMillis() < deadline);
            assertTrue("Native snapshot missing", file.length() > 0);
            try (FileInputStream input = new FileInputStream(file)) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                Bundle result = new Bundle();
                result.putString("sferaUiXml", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                getAutomationSupport().sendStatus(0, result);
            }
        } finally {
            file.delete();
            config.setWaitForIdleTimeout(original);
        }
    }
}
