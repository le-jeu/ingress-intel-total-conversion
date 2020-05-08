package org.exarhteam.iitc_mobile.prefs;

import android.content.Context;
import android.preference.Preference;
import android.text.Html;
import android.text.method.LinkMovementMethod;
import android.util.AttributeSet;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import org.apache.commons.text.StringSubstitutor;

import org.exarhteam.iitc_mobile.BuildConfig;
import org.exarhteam.iitc_mobile.R;

import java.util.HashMap;
import java.util.Map;

public class AboutDialogPreference extends Preference {
    private String mBuildVersion = "";
    private String mIitcVersion = "";

    public AboutDialogPreference(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public View getView(View convertView, ViewGroup parent) {
        /*
         * I found no better way for clickable links in a TextView then using Html.fromHtml(). Linkify
         * is just broken and does not understand html href tags, so let's tag the @string/about_msg
         * with CDATA and use Html.fromHtml() for clickable hrefs with tags.
         */
        final TextView tv = new TextView(getContext());

        Map<String, String> valuesMap = new HashMap<>();
        valuesMap.put("build_version", mBuildVersion);
        valuesMap.put("iitc_version", mIitcVersion);
        valuesMap.put("cradle_link", String.format(getContext().getText(R.string.link_template).toString(), BuildConfig.IITC_CRADLE_URL, "cradle"));
        valuesMap.put("fkloft_link", String.format(getContext().getText(R.string.link_template).toString(), BuildConfig.IITC_FKLOFT_URL, "fkloft"));
        valuesMap.put("giuseppe_lucido_link", String.format(getContext().getText(R.string.link_template).toString(), BuildConfig.IITC_GIUSEPPE_LUCIDO_URL, "Giuseppe Lucido"));
        valuesMap.put("tg_iitc_news_link", String.format(getContext().getText(R.string.link_template).toString(), BuildConfig.IITC_TG_NEWS_URL, "IITC News"));
        valuesMap.put("tg_iitc_group_link", String.format(getContext().getText(R.string.link_template).toString(), BuildConfig.IITC_TG_GROUP_URL, "IITC Group"));
        valuesMap.put("reddit_iitc_link", String.format(getContext().getText(R.string.link_template).toString(), BuildConfig.IITC_REDDIT_URL, "r/IITC/"));
        valuesMap.put("bugtracker_link", String.format(getContext().getText(R.string.link_template).toString(), BuildConfig.IITC_BUGTRACKER_URL, getContext().getText(R.string.bugtracker)));
        valuesMap.put("website_link", String.format(getContext().getText(R.string.link_template).toString(), BuildConfig.IITC_WEBSITE_URL, getContext().getText(R.string.iitc_website)));
        valuesMap.put("github_iitc_link", String.format(getContext().getText(R.string.link_template).toString(), BuildConfig.IITC_GITHUB_URL, getContext().getText(R.string.iitc_ce_format)));
        valuesMap.put("ISC_license_text", getContext().getText(R.string.ISC_license_text).toString());

        String templateString = getContext().getText(R.string.pref_about_text).toString();
        String text = new StringSubstitutor(valuesMap).replace(templateString);

        tv.setText(Html.fromHtml(text));
        tv.setMovementMethod(LinkMovementMethod.getInstance());

        return tv;
    }

    public void setVersions(String iitcVersion, String buildVersion) {
        mIitcVersion = iitcVersion;
        mBuildVersion = buildVersion;
    }
}
