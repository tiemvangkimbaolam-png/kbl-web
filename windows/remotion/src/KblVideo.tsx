import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export type KblWord = {text: string; s: number; e: number};
export type KblPage = {s: number; e: number; words: KblWord[]};
export type KblRow = {label: string; note: string};
export type KblVideoProps = {
  totalSeconds: number;
  kicker: string;
  title1: string;
  title2: string;
  tags: string[];
  sectionTitle1: string;
  sectionTitle2: string;
  rows: KblRow[];
  company: string;
  domain: string;
  endNote: string;
  endTags: string[];
  image1: string;
  image2: string;
  audio: string;
  pages: KblPage[];
  scenes: {scene1End: number; scene2From: number; scene3From: number};
  cues: number[];
};

export const defaultKblProps: KblVideoProps = {
  totalSeconds: 30,
  kicker: 'TIN VÀNG · HÔM NAY',
  title1: 'Giá vàng',
  title2: 'cập nhật trong ngày',
  tags: ['VÀNG', 'THỊ TRƯỜNG', 'KIM BẢO LÂM'],
  sectionTitle1: 'Ba điểm chính',
  sectionTitle2: 'trong bản tin',
  rows: [
    {label: 'Điểm 1', note: 'Dữ liệu đang cập nhật'},
    {label: 'Điểm 2', note: 'Dữ liệu đang cập nhật'},
    {label: 'Điểm 3', note: 'Dữ liệu đang cập nhật'},
  ],
  company: 'KIM BẢO LÂM',
  domain: 'tiemvangkimbaolam.id.vn',
  endNote: 'Thông tin tham khảo tại thời điểm tạo nội dung, không phải khuyến nghị đầu tư.',
  endTags: ['06:30', '18:30'],
  image1: 'scene-1.png',
  image2: 'scene-2.png',
  audio: 'voice.mp3',
  pages: [],
  scenes: {scene1End: 7.5, scene2From: 7, scene3From: 22},
  cues: [11, 15, 18],
};

const PAPER = '#fff9ee';
const INK = '#2a1c0b';
const INK_SOFT = '#6d5636';
const GOLD_DEEP = '#8a5a10';
const GOLD_LINE = 'rgba(168,120,36,0.38)';
const FONT = '"Segoe UI", Arial, "Helvetica Neue", sans-serif';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const rise = (frame: number, delay: number, dur = 22, dist = 30) => {
  const p = interpolate(frame, [delay, delay + dur], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return {opacity: p, transform: `translateY(${(1 - p) * dist}px)`} as const;
};

const fade = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});

const fitSize = (text: string, base: number, maxChars: number, floor = 40) =>
  Math.max(floor, Math.min(base, Math.round((base * maxChars) / Math.max(1, text.length))));

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter((word) => /^[A-Za-zÀ-ỹ0-9]/.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || 'KL';

const Brand = ({opacity, company}: {opacity: number; company: string}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 18, opacity}}>
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 13,
        background: 'linear-gradient(135deg,#e8bf6a,#a9741b)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 21,
        fontWeight: 700,
        color: '#fffaf0',
      }}
    >
      {initials(company)}
    </div>
    <div>
      <div style={{fontSize: 23, fontWeight: 700, letterSpacing: 5.6, color: INK}}>{company.toUpperCase()}</div>
      <div style={{fontSize: 14, fontWeight: 600, letterSpacing: 3.4, color: GOLD_DEEP, marginTop: 6}}>
        TIN VÀNG · NHẬN ĐỊNH
      </div>
    </div>
  </div>
);

const TopScrim = () => (
  <AbsoluteFill
    style={{
      background:
        'linear-gradient(180deg, rgba(255,250,241,0.97) 0%, rgba(255,250,241,0.9) 24%, rgba(255,250,241,0.55) 42%, rgba(255,250,241,0.12) 58%, rgba(255,250,241,0) 70%)',
    }}
  />
);

const BottomScrim = () => (
  <AbsoluteFill
    style={{
      background:
        'linear-gradient(0deg, rgba(255,250,241,0.96) 0%, rgba(255,250,241,0.82) 14%, rgba(255,250,241,0.3) 26%, rgba(255,250,241,0) 36%)',
    }}
  />
);

const Scene1 = ({props}: {props: KblVideoProps}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const end = props.scenes.scene1End * fps;
  const zoom = interpolate(frame, [0, end], [1.05, 1.13], {...clamp, easing: Easing.inOut(Easing.quad)});
  const drift = interpolate(frame, [0, end], [0, -22], clamp);
  const brand = fade(frame, 4, 22);
  const kicker = rise(frame, 10);
  const line1 = rise(frame, 16, 24, 36);
  const line2 = rise(frame, 22, 24, 40);
  const rule = interpolate(frame, [30, 54], [0, 170], {...clamp, easing: Easing.out(Easing.cubic)});
  const tags = rise(frame, 36, 20, 22);
  return (
    <AbsoluteFill style={{backgroundColor: PAPER}}>
      <AbsoluteFill style={{transform: `scale(${zoom}) translateY(${drift}px)`}}>
        <Img src={staticFile(props.image1)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </AbsoluteFill>
      <TopScrim />
      <BottomScrim />
      <AbsoluteFill style={{padding: '76px 72px', display: 'flex', flexDirection: 'column'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
          <Brand opacity={brand} company={props.company} />
          <div style={{fontSize: 14, fontWeight: 600, letterSpacing: 2.6, color: INK_SOFT, opacity: brand * 0.75}}>
            TIN MỚI
          </div>
        </div>
        <div style={{marginTop: 210}}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 11,
              padding: '11px 20px',
              borderRadius: 999,
              border: `1px solid ${GOLD_LINE}`,
              background: 'rgba(255,253,248,0.78)',
              boxShadow: '0 6px 20px rgba(122,86,24,0.08)',
              ...kicker,
            }}
          >
            <span style={{width: 9, height: 9, borderRadius: 5, background: GOLD_DEEP}} />
            <span style={{fontSize: 18, fontWeight: 600, letterSpacing: 2.8, color: INK}}>{props.kicker}</span>
          </div>
          <div
            style={{
              marginTop: 26,
              fontSize: fitSize(props.title1, 80, 15),
              lineHeight: 1.06,
              fontWeight: 700,
              letterSpacing: -1.2,
              color: INK,
              textShadow: '0 2px 22px rgba(255,252,246,0.85)',
              ...line1,
            }}
          >
            {props.title1}
          </div>
          <div
            style={{
              fontSize: fitSize(props.title2, 90, 16),
              lineHeight: 1.04,
              fontWeight: 700,
              letterSpacing: -1.4,
              background: 'linear-gradient(100deg,#7d4d08 0%,#b07b1c 58%,#8d5d10 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              paddingBottom: 8,
              ...line2,
            }}
          >
            {props.title2}
          </div>
          <div
            style={{
              marginTop: 24,
              width: rule,
              height: 4,
              borderRadius: 2,
              background: 'linear-gradient(90deg,#8a5a10,rgba(138,90,16,0))',
            }}
          />
          <div style={{marginTop: 28, display: 'flex', gap: 13, ...tags}}>
            {props.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: 2,
                  color: INK_SOFT,
                  background: 'rgba(255,253,248,0.68)',
                  border: `1px solid ${GOLD_LINE}`,
                  padding: '9px 17px',
                  borderRadius: 999,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Scene2 = ({props}: {props: KblVideoProps}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = props.scenes.scene2From + frame / fps;
  const dur = props.scenes.scene3From - props.scenes.scene2From;
  const zoom = interpolate(frame, [0, dur * fps], [1.12, 1.04], {...clamp, easing: Easing.inOut(Easing.quad)});
  const drift = interpolate(frame, [0, dur * fps], [16, 0], clamp);
  const blend = fade(frame, 0, 14);
  const title = rise(frame, 4, 22, 26);
  const cues = props.cues.slice(0, 3);
  const ends = [cues[1] ?? dur, cues[2] ?? dur, props.totalSeconds - 0.5];
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, opacity: blend}}>
      <AbsoluteFill style={{transform: `scale(${zoom}) translateY(${drift}px)`}}>
        <Img src={staticFile(props.image2)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(255,250,241,0.93) 0%, rgba(255,250,241,0.72) 30%, rgba(255,250,241,0.34) 52%, rgba(255,250,241,0.06) 68%, rgba(255,250,241,0) 78%)',
        }}
      />
      <BottomScrim />
      <AbsoluteFill style={{padding: '76px 72px', display: 'flex', flexDirection: 'column'}}>
        <Brand opacity={blend} company={props.company} />
        <div style={{marginTop: 150}}>
          <div style={{fontSize: 21, fontWeight: 600, letterSpacing: 5, color: GOLD_DEEP, ...title}}>TRONG BẢN TIN</div>
          <div
            style={{
              marginTop: 16,
              fontSize: fitSize(props.sectionTitle1, 74, 14, 44),
              lineHeight: 1.08,
              fontWeight: 700,
              color: INK,
              letterSpacing: -1.2,
              textShadow: '0 2px 20px rgba(255,252,246,0.7)',
              ...rise(frame, 10, 22, 34),
            }}
          >
            {props.sectionTitle1}
            <br />
            {props.sectionTitle2}
          </div>
          <div style={{marginTop: 32, display: 'flex', flexDirection: 'column', gap: 18}}>
            {props.rows.slice(0, 3).map((row, i) => {
              const a = rise(frame, 18 + i * 8, 20, 26);
              const active = Math.min(
                interpolate(t, [cues[i] - 0.15, cues[i] + 0.25], [0, 1], clamp),
                interpolate(t, [ends[i] - 0.25, ends[i] + 0.15], [1, 0], clamp),
              );
              return (
                <div
                  key={row.label + i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 22,
                    padding: '22px 26px',
                    borderRadius: 18,
                    background: `rgba(255,${252 - active * 9},${244 - active * 22},${0.8 + active * 0.16})`,
                    border: `1px solid rgba(168,120,36,${0.24 + active * 0.5})`,
                    boxShadow: `0 16px 38px rgba(112,78,22,${0.09 + active * 0.1})`,
                    backdropFilter: 'blur(10px)',
                    transform: `${a.transform} scale(${1 + active * 0.012})`,
                    opacity: a.opacity,
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 44 + active * 14,
                      borderRadius: 4,
                      background: 'linear-gradient(180deg,#d3a244,#8a5a10)',
                      opacity: 0.4 + active * 0.6,
                    }}
                  />
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 17,
                      fontWeight: 700,
                      letterSpacing: 0.6,
                      color: active > 0.5 ? PAPER : GOLD_DEEP,
                      background: `rgba(138,90,16,${active * 0.92})`,
                      border: `1px solid rgba(138,90,16,${0.22 + active * 0.5})`,
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{minWidth: 0}}>
                    <div
                      style={{
                        fontSize: fitSize(row.label, 34, 18, 22),
                        fontWeight: 700,
                        color: INK,
                        letterSpacing: -0.4,
                        lineHeight: 1.2,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {row.label}
                    </div>
                    <div
                      style={{
                        fontSize: fitSize(row.note, 22, 40, 16),
                        fontWeight: 400,
                        color: INK_SOFT,
                        marginTop: 3,
                        lineHeight: 1.35,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {row.note}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{marginTop: 38, display: 'flex', alignItems: 'center', gap: 16, opacity: fade(frame, 30, 50) * 0.6}}>
            <div style={{width: 96, height: 1, background: GOLD_LINE}} />
            <div style={{fontSize: 15, fontWeight: 600, letterSpacing: 3, color: INK_SOFT}}>
              {props.company.toUpperCase()} · CẬP NHẬT
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const EndCard = ({props}: {props: KblVideoProps}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = props.scenes.scene3From + frame / fps;
  const a = fade(frame, 2, 26);
  const b = rise(frame, 12, 22, 24);
  const glow = 0.2 + Math.sin(t * 0.9) * 0.035;
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, alignItems: 'center', justifyContent: 'center'}}>
      <AbsoluteFill
        style={{background: `radial-gradient(78% 56% at 50% 40%, rgba(199,148,52,${glow}) 0%, rgba(255,249,238,0) 68%)`}}
      />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(247,236,215,0.9) 0%, rgba(255,250,241,0) 22%, rgba(255,250,241,0) 78%, rgba(247,236,215,0.85) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          margin: 'auto',
          width: 660,
          height: 660,
          borderRadius: '50%',
          border: '1px solid rgba(168,120,36,0.2)',
          opacity: a,
          transform: `scale(${1 + Math.sin(t * 0.7) * 0.012})`,
        }}
      />
      <div style={{position: 'absolute', inset: 0, margin: 'auto', width: 860, height: 860, borderRadius: '50%', border: '1px solid rgba(168,120,36,0.08)', opacity: a}} />
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, transform: `scale(${0.96 + a * 0.04})`, opacity: a}}>
        <div style={{fontSize: 16, fontWeight: 600, letterSpacing: 5.2, color: GOLD_DEEP, marginBottom: 4}}>TIN VÀNG MỖI NGÀY</div>
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: 26,
            background: 'linear-gradient(135deg,#e8bf6a,#a9741b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 38,
            fontWeight: 700,
            color: '#fffaf0',
            boxShadow: '0 18px 40px rgba(138,90,16,0.22)',
          }}
        >
          {initials(props.company)}
        </div>
        <div style={{fontSize: fitSize(props.company.toUpperCase(), 62, 13, 40), fontWeight: 700, letterSpacing: 9, color: INK}}>
          {props.company.toUpperCase()}
        </div>
        <div style={{fontSize: 27, fontWeight: 600, letterSpacing: 1.4, color: GOLD_DEEP}}>{props.domain}</div>
        <div style={{marginTop: 8, display: 'flex', gap: 12, ...b}}>
          {props.endTags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 19,
                fontWeight: 600,
                letterSpacing: 2.4,
                color: INK_SOFT,
                background: 'rgba(255,253,248,0.7)',
                border: `1px solid ${GOLD_LINE}`,
                padding: '9px 20px',
                borderRadius: 999,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 20,
            fontWeight: 400,
            color: INK_SOFT,
            opacity: fade(frame, 20, 40) * 0.9,
            textAlign: 'center',
            maxWidth: 760,
            lineHeight: 1.55,
          }}
        >
          {props.endNote}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Captions = ({props}: {props: KblVideoProps}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const page = props.pages.find((p) => t >= p.s - 0.08 && t <= p.e + 0.12);
  if (!page) return null;
  const alpha = Math.min(fade(t, page.s - 0.08, page.s + 0.1), 1 - fade(t, page.e - 0.03, page.e + 0.12));
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 288, display: 'flex', justifyContent: 'center', padding: '0 88px', opacity: alpha}}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          columnGap: 12,
          rowGap: 2,
          padding: '17px 28px',
          borderRadius: 18,
          background: 'rgba(255,252,245,0.9)',
          border: '1px solid rgba(168,120,36,0.32)',
          boxShadow: '0 12px 32px rgba(96,66,18,0.16)',
          backdropFilter: 'blur(9px)',
          maxWidth: 904,
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: 38,
          lineHeight: 1.36,
          textAlign: 'center',
        }}
      >
        {page.words.map((word, i) => {
          const state = t >= word.e ? 2 : t >= word.s ? 1 : 0;
          return (
            <span key={i} style={{color: state === 1 ? GOLD_DEEP : state === 2 ? INK : 'rgba(42,28,11,0.4)'}}>
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const Bloom = ({at}: {at: number}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const from = at * fps - 6;
  if (frame < from || frame > from + 34) return null;
  const x = interpolate(frame, [from, from + 34], [-360, 1160], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const opacity = interpolate(frame, [from, from + 10, from + 34], [0, 0.55, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        top: -180,
        bottom: -180,
        width: 460,
        left: x,
        opacity,
        background: 'radial-gradient(closest-side, rgba(255,255,255,0.85) 0%, rgba(255,241,205,0.45) 46%, rgba(255,236,190,0) 100%)',
        transform: 'skewX(-10deg)',
        mixBlendMode: 'soft-light',
      }}
    />
  );
};

export const KblVideo = (props: KblVideoProps) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const progress = frame / Math.max(1, durationInFrames - 1);
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, fontFamily: FONT}}>
      <Audio src={staticFile(props.audio)} />
      <Sequence from={0} durationInFrames={Math.ceil(props.scenes.scene1End * fps)}>
        <Scene1 props={props} />
      </Sequence>
      <Sequence from={Math.floor(props.scenes.scene2From * fps)} durationInFrames={Math.ceil((props.scenes.scene3From - props.scenes.scene2From) * fps)}>
        <Scene2 props={props} />
      </Sequence>
      <Sequence from={Math.floor(props.scenes.scene3From * fps)}>
        <EndCard props={props} />
      </Sequence>
      <Bloom at={props.scenes.scene2From} />
      <Bloom at={props.scenes.scene3From} />
      <Captions props={props} />
      <div style={{position: 'absolute', left: 0, bottom: 0, right: 0, height: 7, background: 'rgba(138,90,16,0.14)'}} />
      <div style={{position: 'absolute', left: 0, bottom: 0, height: 7, width: `${progress * 100}%`, background: 'linear-gradient(90deg,#a9741b,#c9973a,#e8c47a)'}} />
    </AbsoluteFill>
  );
};
