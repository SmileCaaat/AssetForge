Shader "{{SHADER_NAME}}"
{
    Properties
    {
        _BaseMap ("Base Map", 2D) = "white" {}
        _BaseColorTint ("Base Color Tint", Color) = (1,1,1,1)
        _BaseSaturation ("Base Saturation", Float) = 1.55
        _BaseValue ("Base Value", Float) = 1

        _RampSteps ("Toon Ramp Steps", Range(2, 8)) = 4
        _RampBlend ("Ramp Band Blend", Range(0.05, 0.45)) = 0.18
        _AlbedoInfluence ("Albedo Preserve", Range(0.5, 0.9)) = 0.72
        _AlbedoPosterize ("Albedo Soft Bands", Range(0, 0.6)) = 0.22

        _CelShadowColor ("Cel Shadow Color", Color) = (0.12, 0.14, 0.10, 1)
        _CelHighlightColor ("Cel Highlight Color", Color) = (1, 0.97, 0.90, 1)

        _NormalStrength ("Normal Strength", Range(0.5, 1.5)) = 1.15
        _SlopeRockTint ("Slope Rock Tint", Color) = (0.55, 0.50, 0.42, 1)
        _SlopeTintStrength ("Slope Tint Strength", Range(0, 0.4)) = 0.12

        _ShadowReceiveStrength ("Shadow Receive Strength", Range(0,1)) = 0.7
        _AmbientStrength ("Ambient Strength", Range(0,1)) = 0.25
        _LightColorInfluence ("Light Color Influence", Range(0,1)) = 0.6
        _DistanceSmoothStrength ("Distance Smooth Strength", Range(0, 0.8)) = 0.35
        _DistanceSmoothFar ("Distance Smooth Far", Float) = 48
    }

    SubShader
    {
        Tags
        {
            "RenderPipeline" = "UniversalPipeline"
            "RenderType" = "Opaque"
            "Queue" = "Geometry"
        }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }

            HLSLPROGRAM
            #pragma target 2.0
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma shader_feature_local_fragment _RECEIVE_SHADOWS_OFF

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "Generated/AMTLightingCommon.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);

            float4 _BaseColorTint;
            float _BaseSaturation;
            float _BaseValue;
            float _RampSteps;
            float _RampBlend;
            float _AlbedoInfluence;
            float _AlbedoPosterize;
            float4 _CelShadowColor;
            float4 _CelHighlightColor;
            float _NormalStrength;
            float4 _SlopeRockTint;
            float _SlopeTintStrength;
            float _ShadowReceiveStrength;
            float _AmbientStrength;
            float _LightColorInfluence;
            float _DistanceSmoothStrength;
            float _DistanceSmoothFar;

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionHCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
                float3 normalWS : TEXCOORD2;
            };

            float3 AMT_AdjustHSV(float3 c)
            {
                float gray = dot(c, float3(0.299, 0.587, 0.114));
                c = lerp(gray.xxx, c, _BaseSaturation);
                return saturate(c * _BaseValue);
            }

            // 软 Toon 分层：阶间 smoothstep 混合，避免像素硬跳
            float AMT_SoftToonRamp(float t, float steps, float blend)
            {
                t = saturate(t);
                float s = max(steps, 2.0);
                float x = t * (s - 1.0);
                float i0 = floor(x);
                float f = x - i0;
                float v0 = i0 / (s - 1.0);
                float v1 = min((i0 + 1.0) / (s - 1.0), 1.0);
                float edge = saturate(blend);
                float sf = smoothstep(0.5 - edge * 0.5, 0.5 + edge * 0.5, f);
                return lerp(v0, v1, sf);
            }

            float3 AMT_SoftAlbedoBands(float3 base, float strength, float steps, float blend)
            {
                if (strength <= 0.001) return base;
                float luma = dot(base, float3(0.299, 0.587, 0.114));
                float band = AMT_SoftToonRamp(luma, steps, blend);
                float3 shaped = base * (band / max(luma, 0.02));
                return lerp(base, shaped, saturate(strength));
            }

            Varyings vert(Attributes input)
            {
                Varyings output;
                VertexPositionInputs posInputs = GetVertexPositionInputs(input.positionOS.xyz);
                VertexNormalInputs normInputs = GetVertexNormalInputs(input.normalOS);
                output.positionHCS = posInputs.positionCS;
                output.positionWS = posInputs.positionWS;
                output.uv = input.uv;
                output.normalWS = normInputs.normalWS;
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                float3 base = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv).rgb;
                base *= _BaseColorTint.rgb;
                base = AMT_AdjustHSV(base);
                base = AMT_SoftAlbedoBands(base, _AlbedoPosterize, 4.0, _RampBlend);

                float3 up = float3(0.0, 1.0, 0.0);
                float3 n = normalize(input.normalWS);
                n = normalize(lerp(up, n, saturate(_NormalStrength)));

                // 主光方向/颜色与阴影贴图分离：方向光不受 shadowAttenuation 污染
                Light mainLight = GetMainLight();
                float3 lightDirWS = normalize(mainLight.direction);
                float ndotl = saturate(dot(n, lightDirWS));

                half castShadowAtten = AMT_SampleMainLightShadowAttenuation(
                    input.positionHCS, input.positionWS);

                float litRaw = ndotl;

                // 感知域 remap → [0.2, 0.85]，避免死黑/过曝
                float lit = smoothstep(0.04, 0.96, litRaw);
                lit = lerp(0.2, 0.85, lit);

                // 远景加宽阶间混合，抑制远处闪烁/分层
                float viewDist = length(_WorldSpaceCameraPos.xyz - input.positionWS);
                float distT = saturate(viewDist / max(_DistanceSmoothFar, 1.0));
                float rampBlend = lerp(_RampBlend, min(_RampBlend + 0.2, 0.45), distT * _DistanceSmoothStrength);

                lit = AMT_SoftToonRamp(lit, _RampSteps, rampBlend);

                float3 celTint = lerp(_CelShadowColor.rgb, _CelHighlightColor.rgb, smoothstep(0.08, 0.92, lit));
                float3 lightTint = lerp(float3(1.0, 1.0, 1.0), mainLight.color, _LightColorInfluence);
                celTint *= lightTint;

                // 保留 60–80% BaseColor 色相/明度可读性
                float3 lightingMod = lerp(celTint, float3(1.0, 1.0, 1.0), _AlbedoInfluence);
                float3 color = base * lightingMod;

                color += base * SampleSH(n) * _AmbientStrength;

                // 坡度微染色：陡面偏岩色，保留草地/石板分区
                float slope = 1.0 - saturate(dot(n, up));
                float3 slopeBias = lerp(float3(1.0, 1.0, 1.0), _SlopeRockTint.rgb, slope * _SlopeTintStrength);
                color *= slopeBias;

                // 角色等外部投射阴影：仅在被遮挡区域向 Cel 暗色靠拢，避免整面乘 0 全黑
                float shadowMix = (1.0 - castShadowAtten) * _ShadowReceiveStrength;
                color = lerp(color, color * _CelShadowColor.rgb, shadowMix);

                return half4(saturate(color), 1.0);
            }
            ENDHLSL
        }

        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }

            ZWrite On
            ZTest LEqual
            ColorMask 0
            Cull Back

            HLSLPROGRAM
            #pragma target 2.0
            #pragma vertex ShadowPassVertex
            #pragma fragment ShadowPassFragment
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW

            #include "Packages/com.unity.render-pipelines.universal/Shaders/ShadowCasterPass.hlsl"
            ENDHLSL
        }
    }
    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
