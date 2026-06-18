Shader "{{SHADER_NAME}}"
{
    Properties
    {
        _BaseMap ("Base Map", 2D) = "white" {}
        _BaseColorTint ("Base Color Tint", Color) = (1,1,1,1)

        _BumpMap ("Normal Map", 2D) = "bump" {}
        _BumpScale ("Normal Strength", Float) = 1

        _MetallicGlossMap ("Metallic Smoothness", 2D) = "white" {}

        _RampSteps ("Ramp Steps", Float) = 3
        _ShadowStrength ("Shadow Strength", Range(0,1)) = 0.45
        _ShadowReceiveStrength ("Shadow Receive Strength", Range(0,1)) = 0.7

        _AmbientStrength ("Ambient Strength", Range(0,1)) = 0.25

        _RimColor ("Rim Color", Color) = (1,0.82,0.55,1)
        _RimPower ("Rim Power", Float) = 4
        _RimIntensity ("Rim Intensity", Float) = 2.5
        _RimLightInfluence ("Rim Light Influence", Range(0,1)) = 0.2

        _LightColorInfluence ("Light Color Influence", Range(0,1)) = 0.6

        _OutlineWidth ("Outline Width", Range(0, 0.05)) = 0.01
        _OutlineColor ("Outline Color", Color) = (0,0,0,1)
        _OutlineFarWidthScale ("Outline Far Width Scale", Range(0, 1)) = 0.01
        _OutlineFadeStart ("Outline Fade Start", Float) = -20
        _OutlineFadeEnd ("Outline Fade End", Float) = 25
        _OutlineMinWidth ("Outline Min Width", Float) = 0.001
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
            Name "Outline"
            Tags { "LightMode" = "SRPDefaultUnlit" }
            Cull Front
            ZWrite On
            ZTest LEqual

            HLSLPROGRAM
            #pragma vertex outlineVert
            #pragma fragment outlineFrag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            float _OutlineWidth;
            float4 _OutlineColor;
            float _OutlineFarWidthScale;
            float _OutlineFadeStart;
            float _OutlineFadeEnd;
            float _OutlineMinWidth;

            struct OutlineAttributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
            };

            struct OutlineVaryings
            {
                float4 positionHCS : SV_POSITION;
            };

            OutlineVaryings outlineVert(OutlineAttributes input)
            {
                OutlineVaryings output;

                VertexPositionInputs vertexInput = GetVertexPositionInputs(input.positionOS.xyz);
                VertexNormalInputs normalInput = GetVertexNormalInputs(input.normalOS);

                float4 positionCS = vertexInput.positionCS;
                float3 normalCS = TransformWorldToHClipDir(normalInput.normalWS, true);

                float dist = distance(_WorldSpaceCameraPos, vertexInput.positionWS);

                float farT = saturate(
                    (dist - _OutlineFadeStart) / max(_OutlineFadeEnd - _OutlineFadeStart, 0.0001)
                );

                float widthScale = lerp(1.0, _OutlineFarWidthScale, farT);
                float scaledWidth = _OutlineWidth * widthScale;

                float finalOutlineWidth = scaledWidth;
                if (farT > 0.001)
                    finalOutlineWidth = max(scaledWidth, _OutlineMinWidth * farT);

                positionCS.xy += normalCS.xy * finalOutlineWidth * positionCS.w;

                output.positionHCS = positionCS;
                return output;
            }

            half4 outlineFrag(OutlineVaryings input) : SV_Target
            {
                if (_OutlineWidth <= 0.0001)
                    discard;
                return half4(_OutlineColor.rgb, _OutlineColor.a);
            }
            ENDHLSL
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
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma shader_feature_local_fragment _RECEIVE_SHADOWS_OFF

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "Generated/AMTLightingCommon.hlsl"
            #include "Generated/ToonCore.generated.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);
            TEXTURE2D(_BumpMap);
            SAMPLER(sampler_BumpMap);

            float4 _BaseColorTint;
            float _BumpScale;
            float _RampSteps;
            float _ShadowStrength;
            float _ShadowReceiveStrength;
            float _AmbientStrength;
            float4 _RimColor;
            float _RimPower;
            float _RimIntensity;
            float _RimLightInfluence;
            float _LightColorInfluence;

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float4 tangentOS : TANGENT;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionHCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float3 normalWS : TEXCOORD1;
                float3 tangentWS : TEXCOORD2;
                float3 bitangentWS : TEXCOORD3;
                float2 uv : TEXCOORD4;
            };

            float3 SampleNormalWS(Varyings input)
            {
                float3 normalWS = normalize(input.normalWS);
                float3 map = UnpackNormalScale(SAMPLE_TEXTURE2D(_BumpMap, sampler_BumpMap, input.uv), _BumpScale);
                float3 tangentWS = normalize(input.tangentWS);
                float3 bitangentWS = normalize(input.bitangentWS);
                float3x3 tbn = float3x3(tangentWS, bitangentWS, normalWS);
                return normalize(mul(map, tbn));
            }

            Varyings vert(Attributes input)
            {
                Varyings output;
                VertexPositionInputs posInputs = GetVertexPositionInputs(input.positionOS.xyz);
                VertexNormalInputs normInputs = GetVertexNormalInputs(input.normalOS, input.tangentOS);
                output.positionHCS = posInputs.positionCS;
                output.positionWS = posInputs.positionWS;
                output.normalWS = normInputs.normalWS;
                output.tangentWS = normInputs.tangentWS;
                output.bitangentWS = normInputs.bitangentWS;
                output.uv = input.uv;
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                float4 baseSample = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv);
                float3 baseColor = baseSample.rgb * _BaseColorTint.rgb;

                float3 normalWS = SampleNormalWS(input);
                float3 viewDirWS = normalize(GetWorldSpaceViewDir(input.positionWS));

                Light mainLight = GetMainLight();
                float3 lightDirWS = normalize(mainLight.direction);

                half castShadowAtten = AMT_SampleMainLightShadowAttenuation(
                    input.positionHCS, input.positionWS);

                float ndotl = saturate(dot(normalWS, lightDirWS));
                float litTerm = ndotl * lerp(1.0, castShadowAtten, _ShadowReceiveStrength);

                ToonParams p;
                p.baseColor = baseColor;
                p.rampSteps = _RampSteps;
                p.shadowStrength = _ShadowStrength;
                p.rimPower = _RimPower;
                p.rimIntensity = _RimIntensity;
                p.rimColor = _RimColor.rgb;

                float3 color = AMT_ApplyToonRamp(litTerm, p);

                float3 lightTint = lerp(float3(1.0, 1.0, 1.0), mainLight.color, _LightColorInfluence);
                color *= lightTint;

                float3 ambient = SampleSH(normalWS) * _AmbientStrength;
                color += baseColor * ambient;

                float rim = pow(1.0 - saturate(dot(normalWS, viewDirWS)), _RimPower);
                float3 rimCol = lerp(_RimColor.rgb, _RimColor.rgb * mainLight.color, _RimLightInfluence);
                color += rimCol * rim * _RimIntensity;

                return half4(color, baseSample.a * _BaseColorTint.a);
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
