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

        _RimColor ("Rim Color", Color) = (1,0.82,0.55,1)
        _RimPower ("Rim Power", Float) = 4
        _RimIntensity ("Rim Intensity", Float) = 2.5

        _OutlineWidth ("Outline Width", Range(0, 0.05)) = 0.01
        _OutlineColor ("Outline Color", Color) = (0,0,0,1)
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

            HLSLPROGRAM
            #pragma vertex outlineVert
            #pragma fragment outlineFrag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            float _OutlineWidth;
            float4 _OutlineColor;

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

                // 裁剪空间外扩：屏幕像素级厚度，与 FBX 单位无关
                float4 positionCS = vertexInput.positionCS;
                float3 normalCS = TransformWorldToHClipDir(normalInput.normalWS, true);
                positionCS.xy += normalCS.xy * _OutlineWidth * positionCS.w;

                output.positionHCS = positionCS;
                return output;
            }

            half4 outlineFrag(OutlineVaryings input) : SV_Target
            {
                if (_OutlineWidth <= 0.0001)
                    discard;
                return half4(_OutlineColor.rgb, 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }

            HLSLPROGRAM

            #pragma vertex vert
            #pragma fragment frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "Generated/ToonCore.generated.hlsl"

            TEXTURE2D(_BaseMap);
            SAMPLER(sampler_BaseMap);
            TEXTURE2D(_BumpMap);
            SAMPLER(sampler_BumpMap);

            float4 _BaseColorTint;
            float _BumpScale;
            float _RampSteps;
            float _ShadowStrength;
            float4 _RimColor;
            float _RimPower;
            float _RimIntensity;

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

                Light mainLight = GetMainLight();
                float3 normalWS = SampleNormalWS(input);
                float3 lightDirWS = normalize(mainLight.direction);
                float3 viewDirWS = normalize(GetWorldSpaceViewDir(input.positionWS));

                ToonParams p;
                p.baseColor = baseColor;
                p.rampSteps = _RampSteps;
                p.shadowStrength = _ShadowStrength;
                p.rimPower = _RimPower;
                p.rimIntensity = _RimIntensity;
                p.rimColor = _RimColor.rgb;

                float3 color = AMT_EvaluateToon(normalWS, lightDirWS, viewDirWS, p);

                return half4(color, baseSample.a * _BaseColorTint.a);
            }

            ENDHLSL
        }
    }

    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
