package com.drop.ai

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * DropAI — the Capacitor bridge between the React app and the native engine.
 *
 * The React layer only ever sees this clean surface (prepare, getStatus,
 * ocr, analyzeImage, getEmbedding, generateText, answerQuestion, policy,
 * model management) plus two events: `status` and `downloadProgress`.
 */
@CapacitorPlugin(name = "DropAI")
class DropAIPlugin : Plugin() {

    private val engine: DropAIEngine by lazy { DropAIEngine.init(context) }

    override fun load() {
        engine.onStatus = { status ->
            notifyListeners("status", JSObject().put("status", status))
        }
        engine.onProgress = { progress, label ->
            val data = JSObject()
            data.put("progress", progress)
            data.put("label", label)
            notifyListeners("downloadProgress", data)
        }
    }

    @PluginMethod
    fun prepare(call: PluginCall) {
        engine.prepare { ok ->
            val ret = JSObject()
            ret.put("ok", ok)
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val ret = JSObject()
        ret.put("status", engine.statusMap())
        call.resolve(ret)
    }

    @PluginMethod
    fun getEmbedding(call: PluginCall) {
        val text = call.getString("text") ?: run {
            call.reject("Missing text")
            return
        }
        val embedding = engine.embed(text)
        val ret = JSObject()
        ret.put("embedding", embedding)
        call.resolve(ret)
    }

    @PluginMethod
    fun ocr(call: PluginCall) {
        val image = call.getString("image") ?: run {
            call.resolve(null)
            return
        }
        launch {
            val result = engine.ocr(image)
            if (result == null) {
                call.resolve(null)
            } else {
                val ret = JSObject()
                ret.put("text", result["text"])
                ret.put("language", result["language"])
                call.resolve(ret)
            }
        }
    }

    @PluginMethod
    fun analyzeImage(call: PluginCall) {
        val image = call.getString("image") ?: run {
            call.resolve(null)
            return
        }
        launch {
            val result = engine.analyzeImage(image)
            val ret = JSObject()
            if (result == null) {
                ret.putNull("analysis")
            } else {
                ret.put("analysis", JSObject(result))
            }
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun generateText(call: PluginCall) {
        val prompt = call.getString("prompt") ?: run {
            call.resolve(null)
            return
        }
        val contextText = call.getString("context")
        launch {
            val ret = JSObject()
            ret.put("text", engine.generateText(prompt, contextText))
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun answerQuestion(call: PluginCall) {
        val question = call.getString("question") ?: run {
            call.resolve(null)
            return
        }
        val contextText = call.getString("context") ?: ""
        launch {
            val ret = JSObject()
            ret.put("answer", engine.answerQuestion(question, contextText))
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun setPolicy(call: PluginCall) {
        engine.setWifiOnly(call.getBoolean("wifiOnly", true))
        val ret = JSObject()
        ret.put("ok", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun getPolicy(call: PluginCall) {
        val ret = JSObject()
        ret.put("wifiOnly", engine.getWifiOnly())
        call.resolve(ret)
    }

    @PluginMethod
    fun removeModel(call: PluginCall) {
        val ok = engine.removeModel()
        val ret = JSObject()
        ret.put("ok", ok)
        call.resolve(ret)
    }

    @PluginMethod
    fun getStorageInfo(call: PluginCall) {
        val bytes = engine.storageBytes()
        if (bytes <= 0) {
            call.resolve(null)
            return
        }
        val ret = JSObject()
        ret.put("sizeBytes", bytes)
        call.resolve(ret)
    }

    private fun launch(block: suspend () -> Unit) {
        engine.launchOn(block)
    }
}
