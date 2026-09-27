"use client";
import { useEffect, useRef, type RefObject } from "react";
import { mountPitchDeckArt } from "./deck-art.js";
import styles from "./pitch-deck.module.css";

/** Source slide identities; never replace these with positional model targets. */
export const DECK_RENDERER_IDS = ["open", "anecdote", "problem", "hall", "whynow", "product", "demo", "value", "competition", "gtm", "tam", "model", "financials", "whyus", "supports", "roadmap", "vision", "ask"] as const;
type DeckSlideId = (typeof DECK_RENDERER_IDS)[number];

export function PitchDeckSlide({ slideId, replayKey = 0 }: { slideId: string; replayKey?: number }) {
  const rootRef = useRef<HTMLElement>(null);
  const valid = DECK_RENDERER_IDS.includes(slideId as DeckSlideId);
  useEffect(() => {
    if (!valid || !rootRef.current) return;
    return mountPitchDeckArt(rootRef.current, slideId);
  }, [valid, slideId, replayKey]);
  if (!valid) return null;
  return <section className={styles.surface} aria-label={`Imagineer slide: ${slideId}`}>
    <div className={styles.brandHint}>Imagineer</div>
    <SlideMarkup key={`${slideId}:${replayKey}`} slideId={slideId as DeckSlideId} rootRef={rootRef} />
  </section>;
}

/** Original layout and copy, expressed as React markup with scoped artwork mounts. */
function SlideMarkup({ slideId, rootRef }: { slideId: DeckSlideId; rootRef: RefObject<HTMLElement | null> }) {
  switch (slideId) {
    case "open": return (
      <section ref={rootRef} className="slide on" data-slide="open">
        <div style={{"flex": "1", "display": "grid", "placeItems": "center"}}>
          <div style={{"textAlign": "center"}}>
            <svg id="logo-hero" viewBox="-8 -8 1326 814" style={{"width": "620px", "height": "auto"}} />
            <div className="rv" id="open-names" style={{"marginTop": "46px"}}>
              <div className="tiny" style={{"letterSpacing": ".22em"}}>
                {"VIVAAN GROVER  ·  JACKSON BIZZELL  ·  KRISH SAPOVADIA"}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
    case "anecdote": return (
      <section ref={rootRef} className="slide on" data-slide="anecdote">
        <div className="body col" style={{"gap": "12px", "paddingTop": "4px"}}>
          <h2 className="rv" id="an-1">
            {"Sophomore year, AP Bio"}
          </h2>
          <svg id="etc-art" viewBox="0 0 1256 372" style={{"width": "100%", "height": "auto", "marginTop": "-4px"}} />
          <div style={{"display": "flex", "gap": "56px", "alignItems": "baseline", "marginTop": "2px"}}>
            <p className="lede rv" id="an-2" style={{"flex": "1", "maxWidth": "660px"}}>
              <em>
                {"Close your eyes and picture the electron transport chain."}
              </em>
            </p>
            <h2 className="rv" id="an-3" style={{"fontSize": "44px"}}>
              {"I saw nothing."}
            </h2>
          </div>
        </div>
      </section>
    );
    case "problem": return (
      <section ref={rootRef} className="slide on" data-slide="problem">
        <div className="body col" style={{"gap": "28px", "paddingTop": "28px"}}>
          <h2 className="rv" id="pb-h">
            {"Teachers can't show what they're talking about"}
          </h2>
          <div id="pb-rows" style={{"display": "flex", "flexDirection": "column", "gap": "46px", "marginTop": "6px"}} />
        </div>
      </section>
    );
    case "hall": return (
      <section ref={rootRef} className="slide on" data-slide="hall">
        <div className="body col" style={{"gap": "0", "paddingTop": "10px"}}>
          <h2 className="rv" id="hl-h" data-d="120">
            {"So we built it."}
          </h2>
          <svg id="hall-art" viewBox="0 0 1256 500" style={{"width": "100%", "height": "auto", "marginTop": "2px"}} />
          <div style={{"display": "flex", "alignItems": "baseline", "gap": "34px", "marginTop": "20px"}}>
            <p className="lede rv" id="hl-p" style={{"flex": "1", "maxWidth": "720px"}}>
              {"\n          Any room. Any subject. "}
              <em>
                {"While you're still talking."}
              </em>
            </p>
            <div id="hall-tabs" style={{"display": "flex", "gap": "0"}} />
          </div>
        </div>
      </section>
    );
    case "whynow": return (
      <section ref={rootRef} className="slide on" data-slide="whynow">
        <div className="body col" style={{"gap": "6px", "paddingTop": "2px"}}>
          <h2 className="rv" id="wn-h">
            {"Why this is possible right now"}
          </h2>
          <div style={{"display": "flex", "gap": "40px", "alignItems": "flex-start", "marginTop": "6px"}}>
            <div className="col" style={{"width": "600px"}}>
              <svg id="wn-art" viewBox="0 0 680 280" style={{"width": "100%", "height": "auto"}} />
            </div>
            <div className="col" style={{"flex": "1"}}>
              <svg id="wn-cost" viewBox="0 0 520 280" style={{"width": "100%", "height": "auto"}} />
            </div>
          </div>
          <div className="rule" style={{"marginTop": "2px"}} />
          <div id="wn-bullets" style={{"display": "flex", "gap": "40px", "marginTop": "16px"}} />
        </div>
      </section>
    );
    case "product": return (
      <section ref={rootRef} className="slide on" data-slide="product">
        <div className="body col" style={{"gap": "14px", "paddingTop": "8px"}}>
          <h2 className="rv" id="pr-h">
            {"One picks what to draw. The other draws it."}
          </h2>
          <svg id="pipe-art" viewBox="0 0 1256 300" style={{"width": "100%", "height": "auto"}} />
          <div id="moat-cols" style={{"display": "flex", "gap": "44px", "marginTop": "2px"}} />
        </div>
      </section>
    );
    case "demo": return (
      <section ref={rootRef} className="slide on" data-slide="demo">
        <svg id="demo-art" style={{"position": "absolute", "inset": "0", "width": "100%", "height": "100%"}} />
        <div style={{"position": "relative", "flex": "1", "display": "grid", "placeItems": "center", "textAlign": "center"}}>
          <div>
            <h1 className="rv" id="dm-1" style={{"fontSize": "88px"}}>
              {"Let’s show you."}
            </h1>
            <div className="rv" id="dm-2" style={{"marginTop": "34px"}}>
              <span className="ph">
                {"live demo  ·  how it works  ·  what’s next"}
              </span>
            </div>
          </div>
        </div>
      </section>
    );
    case "value": return (
      <section ref={rootRef} className="slide on" data-slide="value">
        <div className="body col" style={{"gap": "6px", "paddingTop": "2px"}}>
          <h2 className="rv" id="vl-h">
            {"Class runs 50 minutes. Attention lasts ten."}
          </h2>
          <svg id="val-art" viewBox="0 0 1256 268" style={{"width": "100%", "height": "auto", "marginTop": "2px"}} />
          <div id="vl-points" style={{"display": "flex", "gap": "42px", "marginTop": "12px"}} />
          <h3 className="rv" id="vl-close" style={{"fontSize": "27px", "fontWeight": "400", "marginTop": "18px"}}>
            {"\n        We are changing how people explain things, starting in the room where it matters most.\n      "}
          </h3>
        </div>
      </section>
    );
    case "competition": return (
      <section ref={rootRef} className="slide on" data-slide="competition">
        <div className="body col" style={{"justifyContent": "center", "paddingTop": "0"}}>
          <svg id="cp-art" viewBox="0 0 1256 500" style={{"width": "100%", "height": "auto"}} />
        </div>
      </section>
    );
    case "gtm": return (
      <section ref={rootRef} className="slide on" data-slide="gtm">
        <div className="body col" style={{"gap": "8px", "paddingTop": "6px"}}>
          <h2 className="rv" id="gtm-h">
            {"Start where one person can sign"}
          </h2>
          <svg id="gtm-art" viewBox="0 0 1256 322" style={{"width": "100%", "height": "auto", "marginTop": "2px"}} />
          <div style={{"display": "flex", "gap": "44px", "alignItems": "center", "marginTop": "4px"}}>
            <h3 className="rv" id="gtm-h2" style={{"fontSize": "25px", "fontWeight": "400", "width": "430px"}}>
              {"\n          The sales team is the teacher next door\n        "}
            </h3>
            <svg id="gtm-spread" viewBox="0 0 720 120" style={{"flex": "1", "height": "auto"}} />
          </div>
        </div>
      </section>
    );
    case "tam": return (
      <section ref={rootRef} className="slide on" data-slide="tam">
        <div className="body" style={{"gap": "44px", "alignItems": "stretch", "paddingTop": "6px"}}>
          <div className="col" style={{"width": "352px", "gap": "0", "paddingTop": "20px"}}>
            <div className="tiny" id="tam-stage" style={{"letterSpacing": ".22em"}} />
            <div className="num" id="tam-num" style={{"marginTop": "14px"}}>
              {"$0"}
            </div>
            <h3 id="tam-label" style={{"marginTop": "12px"}} />
            <p id="tam-sub" style={{"marginTop": "10px", "color": "var(--stone)", "minHeight": "96px"}} />
            <div id="tam-mode" style={{"display": "flex", "gap": "0", "marginTop": "2px"}}>
              <button className="tam-tab on" data-mode="teacher" type="button">
                {"Per teacher"}
              </button>
              <button className="tam-tab" data-mode="school" type="button">
                {"Per school"}
              </button>
            </div>
            <button id="tam-expand" type="button">
              {"Expand"}
            </button>
            <div style={{"flex": "1"}} />
            <div className="rule" style={{"marginBottom": "12px"}} />
            <p className="tiny" id="tam-src" />
          </div>
          <div className="col" style={{"flex": "1", "justifyContent": "center"}}>
            <svg id="map" viewBox="0 0 900 560" style={{"width": "100%", "height": "auto"}} />
          </div>
        </div>
      </section>
    );
    case "model": return (
      <section ref={rootRef} className="slide on" data-slide="model">
        <div className="body col" style={{"gap": "22px", "paddingTop": "12px"}}>
          <h2 className="rv" id="bm-h">
            {"Teachers get us in. Schools are the business."}
          </h2>
          <svg id="bm-art" viewBox="0 0 1256 472" style={{"width": "100%", "height": "auto"}} />
        </div>
      </section>
    );
    case "financials": return (
      <section ref={rootRef} className="slide on" data-slide="financials">
        <div className="body" style={{"gap": "56px", "paddingTop": "10px"}}>
          <div className="col" style={{"width": "500px", "gap": "12px"}}>
            <h2 className="rv" id="fin-h">
              {"$15,600 buys"}
              <br />
              {"twelve months"}
            </h2>
            <svg id="uof-art" viewBox="0 0 540 330" style={{"width": "100%", "height": "auto", "marginTop": "2px"}} />
          </div>
          <div className="col" style={{"flex": "1", "gap": "10px", "paddingTop": "4px"}}>
            <h3 className="rv" id="fin-h2" style={{"fontWeight": "400"}}>
              {"Three-year view"}
            </h3>
            <p className="tiny rv" id="fin-gp" style={{"marginTop": "-4px"}}>
              {"Year 3  ·  100 schools  ·  $960k revenue  ·  $766k gross profit"}
            </p>
            <svg id="proj-art" viewBox="0 0 620 306" style={{"width": "100%", "height": "auto"}} />
          </div>
        </div>
      </section>
    );
    case "whyus": return (
      <section ref={rootRef} className="slide on" data-slide="whyus">
        <div className="body" style={{"gap": "60px", "alignItems": "center"}}>
          <div className="col" style={{"width": "560px"}}>
            <svg id="team-art" viewBox="0 0 560 508" style={{"width": "100%", "height": "auto"}} />
          </div>
          <div className="col" style={{"flex": "1", "gap": "26px"}}>
            <h1 className="rv" id="wu-1" style={{"fontSize": "56px"}}>
              {"We sat in"}
              <br />
              {"this classroom."}
            </h1>
            <p className="lede rv" id="wu-2" style={{"maxWidth": "470px"}}>
              {"\n          Three years stuck with this. We were the market.\n        "}
            </p>
            <p className="lede rv" id="wu-4" style={{"maxWidth": "470px"}}>
              {"\n          Then we built the thing you just watched.\n        "}
            </p>
          </div>
        </div>
      </section>
    );
    case "supports": return (
      <section ref={rootRef} className="slide on" data-slide="supports">
        <div className="body col" style={{"gap": "10px", "paddingTop": "10px"}}>
          <h2 className="rv" id="sp-h">
            {"People who already said yes"}
          </h2>
          <div id="sp-row" style={{"display": "flex", "gap": "44px", "marginTop": "10px"}} />
        </div>
      </section>
    );
    case "roadmap": return (
      <section ref={rootRef} className="slide on" data-slide="roadmap">
        <div className="body" style={{"gap": "40px", "paddingTop": "14px"}}>
          <div className="col" style={{"width": "300px", "gap": "16px", "paddingTop": "8px"}}>
            <h2 className="rv" id="rm-h">
              {"What happens"}
              <br />
              {"next"}
            </h2>
            <p className="rv" id="rm-p" style={{"color": "var(--stone)"}}>
              {"\n          One thing has to land first.\n        "}
            </p>
          </div>
          <div className="col" style={{"flex": "1"}}>
            <div id="rm-list" />
          </div>
        </div>
      </section>
    );
    case "vision": return (
      <section ref={rootRef} className="slide on" data-slide="vision">
        <div className="body col" style={{"gap": "18px", "paddingTop": "22px"}}>
          <h2 className="rv" id="vs-h">
            {"The board is just the start"}
          </h2>
          <svg id="vs-art" viewBox="0 0 1256 470" style={{"width": "100%", "height": "auto"}} />
        </div>
      </section>
    );
    case "ask": return (
      <section ref={rootRef} className="slide on" data-slide="ask">
        <div className="body" style={{"gap": "56px", "paddingTop": "16px"}}>
          <div className="col" style={{"flex": "1", "gap": "0"}} id="ask-list" />
          <div className="col" style={{"width": "330px", "justifyContent": "flex-end", "alignItems": "flex-end"}}>
            <svg id="ask-mark" viewBox="0 0 133 512" style={{"width": "60px", "height": "auto", "marginBottom": "8px"}} />
            <div className="tiny rv" id="ask-tag" style={{"textAlign": "right"}}>
              {"Imagining better explanations"}
            </div>
          </div>
        </div>
      </section>
    );
  }
}
