(async function () {
      "use strict";

      async function loadDashboardData() {
        try {
          var response = await fetch("data/sessions.json", { cache: "no-store" });
          if (!response.ok) throw new Error("HTTP " + response.status);
          return await response.json();
        } catch (error) {
          var fallback = document.getElementById("dashboard-data");
          if (fallback && fallback.textContent.trim()) return JSON.parse(fallback.textContent);
          throw new Error("세션 데이터를 불러오지 못했습니다. GitHub Pages 또는 로컬 웹 서버에서 열어 주세요.");
        }
      }

      var raw = await loadDashboardData();
      var state = {
        meta: raw.meta || {},
        sessions: (raw.sessions || []).filter(function (d) { return d.completed !== false; }),
        target: Number((raw.meta && raw.meta.targetScore) || 8)
      };

      var skillKeys = ["유창성", "문법", "어휘·표현", "발음", "자신감"];
      var tooltip = d3.select("#tooltip");
      var fmt1 = d3.format(".1f");

      function setSafeHtml(element, html, allowedTags) {
        var template = document.createElement("template");
        template.innerHTML = String(html == null ? "" : html);
        Array.prototype.slice.call(template.content.querySelectorAll("*")).forEach(function (node) {
          var tag = node.tagName.toLowerCase();
          if (allowedTags.indexOf(tag) === -1) {
            node.replaceWith(document.createTextNode(node.textContent));
            return;
          }
          Array.prototype.slice.call(node.attributes).forEach(function (attribute) {
            if (!(tag === "span" && attribute.name === "class" && attribute.value === "accent")) {
              node.removeAttribute(attribute.name);
            }
          });
        });
        element.textContent = "";
        element.appendChild(template.content);
      }

      function showTip(html, event) {
        setSafeHtml(tooltip.node(), html, ["strong", "br"]);
        tooltip
          .style("left", event.clientX + "px")
          .style("top", event.clientY + "px")
          .style("opacity", 1);
      }
      function hideTip() { tooltip.style("opacity", 0); }

      function completedSessions() {
        return state.sessions.filter(function (s) { return s.completed !== false; });
      }

      function mean(arr) {
        if (!arr.length) return 0;
        return arr.reduce(function (a, b) { return a + Number(b || 0); }, 0) / arr.length;
      }

      function summary() {
        var sessions = completedSessions().slice().sort(function (a, b) {
          return new Date(a.date) - new Date(b.date);
        });
        var averages = {};
        skillKeys.forEach(function (key) {
          averages[key] = mean(sessions.map(function (s) { return Number((s.scores || {})[key] || 0); }));
        });
        return {
          sessions: sessions,
          count: sessions.length,
          minutes: d3.sum(sessions, function (s) { return Number(s.minutes || 0); }),
          turns: d3.sum(sessions, function (s) { return Number(s.speakingTurns || 0); }),
          overall: mean(sessions.map(function (s) { return Number(s.overall || 0); })),
          averages: averages,
          latest: sessions.length ? sessions[sessions.length - 1] : null,
          issues: [
            { name: "문법 오류", value: d3.sum(sessions, function (s) { return Number(s.grammarErrors || 0); }) },
            { name: "표현 공백", value: d3.sum(sessions, function (s) { return Number(s.expressionGaps || 0); }) },
            { name: "발음 이슈", value: d3.sum(sessions, function (s) { return Number(s.pronunciationIssues || 0); }) }
          ]
        };
      }

      function clearHost(id) { d3.select(id).selectAll("*").remove(); }

      function renderKpis(s) {
        var latestDate = s.latest ? s.latest.date : "-";
        var cards = [
          { label: "실제 완료 세션", value: s.count + "회", note: "샘플 제외" },
          { label: "누적 학습시간", value: s.minutes + "분", note: "완료 세션 합계" },
          { label: "누적 발화 턴", value: s.turns + "턴", note: "상호작용량 지표" },
          { label: "현재 종합점수", value: s.count ? fmt1(s.overall) : "-", note: "10점 기준" },
          { label: "최근 학습일", value: latestDate, note: state.meta.learnerLevel || "" }
        ];
        var host = d3.select("#kpiGrid");
        host.selectAll("*").remove();
        var card = host.selectAll("article").data(cards).enter().append("article").attr("class", "card");
        card.append("div").attr("class", "kpi-label").text(function (d) { return d.label; });
        card.append("div").attr("class", "kpi-value").text(function (d) { return d.value; });
        card.append("div").attr("class", "kpi-note").text(function (d) { return d.note; });
      }

      function renderReadiness(s) {
        var title, text, phase;
        if (s.count < 3) {
          phase = "● 기준선 수집 중";
          title = "현재는 기준선 수집 단계입니다.";
          text = "실제 기록이 " + s.count + "회이므로 향상률, 정체 영역, 반복 오류는 아직 판정하지 않습니다. 3회부터 방향성, 5회부터 반복성, 7회부터 이동평균을 계산합니다.";
        } else if (s.count < 5) {
          phase = "● 초기 추세 확인";
          title = "초기 방향성을 확인할 수 있습니다.";
          text = "점수의 상승·하락 방향은 볼 수 있지만 반복 오류와 정체 여부는 아직 확정하지 않습니다.";
        } else if (s.count < 7) {
          phase = "● 반복 패턴 분석";
          title = "반복 오류와 표현 공백을 분석할 수 있습니다.";
          text = "최근 5회에서 반복되는 약점을 다음 세션 커리큘럼에 우선 반영합니다.";
        } else {
          phase = "● 정식 추세 분석";
          title = "이동평균과 난이도 조정이 활성화되었습니다.";
          text = "최근 7회 이동평균, 개선 속도, 정체 영역을 바탕으로 학습 난이도를 자동 조정합니다.";
        }
        d3.select("#phaseBadge").text(phase);
        d3.select("#dataReadinessTitle").text(title);
        d3.select("#dataReadinessText").text(text);
      }

      function renderRadar(s) {
        clearHost("#radarChart");
        if (!s.count) {
          d3.select("#radarChart").append("div").attr("class", "empty-state").text("표시할 실제 세션이 없습니다.");
          return;
        }
        var host = document.getElementById("radarChart");
        var width = Math.max(300, host.clientWidth);
        var height = 300;
        var size = Math.min(width, height);
        var radius = size * 0.34;
        var cx = width / 2, cy = height / 2 + 3;
        var svg = d3.select("#radarChart").append("svg").attr("width", width).attr("height", height);
        var g = svg.append("g").attr("transform", "translate(" + cx + "," + cy + ")");
        var levels = [2,4,6,8,10];
        var angle = 2 * Math.PI / skillKeys.length;

        levels.forEach(function (level) {
          var points = skillKeys.map(function (_, i) {
            var a = -Math.PI / 2 + i * angle;
            var r = radius * level / 10;
            return [Math.cos(a) * r, Math.sin(a) * r];
          });
          g.append("polygon")
            .attr("points", points.map(function (p) { return p.join(","); }).join(" "))
            .style("fill", "none")
            .style("stroke", "#dfe5ee")
            .style("stroke-width", 1);
        });

        skillKeys.forEach(function (key, i) {
          var a = -Math.PI / 2 + i * angle;
          g.append("line")
            .attr("x1", 0).attr("y1", 0)
            .attr("x2", Math.cos(a) * radius).attr("y2", Math.sin(a) * radius)
            .style("stroke", "#e5eaf2");
          var lr = radius + 26;
          g.append("text")
            .attr("x", Math.cos(a) * lr)
            .attr("y", Math.sin(a) * lr)
            .attr("text-anchor", Math.cos(a) > .2 ? "start" : Math.cos(a) < -.2 ? "end" : "middle")
            .attr("dominant-baseline", "middle")
            .style("font-size", "12px")
            .style("fill", "#4b5565")
            .text(key);
        });

        var dataPoints = skillKeys.map(function (key, i) {
          var a = -Math.PI / 2 + i * angle;
          var r = radius * s.averages[key] / 10;
          return { key: key, value: s.averages[key], x: Math.cos(a) * r, y: Math.sin(a) * r };
        });
        var targetPoints = skillKeys.map(function (_, i) {
          var a = -Math.PI / 2 + i * angle;
          var r = radius * state.target / 10;
          return [Math.cos(a) * r, Math.sin(a) * r];
        });

        g.append("polygon")
          .attr("points", targetPoints.map(function (p) { return p.join(","); }).join(" "))
          .style("fill", "rgba(54,89,217,.04)")
          .style("stroke", "#9cacdf")
          .style("stroke-dasharray", "5 4");

        g.append("polygon")
          .attr("points", dataPoints.map(function (p) { return p.x + "," + p.y; }).join(" "))
          .style("fill", "rgba(54,89,217,.25)")
          .style("stroke", "#3659d9")
          .style("stroke-width", 2.5);

        g.selectAll(".radar-dot")
          .data(dataPoints).enter().append("circle")
          .attr("class", "radar-dot")
          .attr("cx", function (d) { return d.x; })
          .attr("cy", function (d) { return d.y; })
          .attr("r", 4.5)
          .style("fill", "#3659d9")
          .style("stroke", "white")
          .style("stroke-width", 2)
          .on("mousemove", function (d) {
            showTip("<strong>" + d.key + "</strong><br>현재 " + fmt1(d.value) + " / 목표 " + fmt1(state.target), d3.event);
          })
          .on("mouseout", hideTip);
      }

      function renderGap(s) {
        clearHost("#gapChart");
        if (!s.count) return;
        var host = document.getElementById("gapChart");
        var width = Math.max(300, host.clientWidth);
        var height = 300;
        var margin = { top: 22, right: 38, bottom: 32, left: 82 };
        var innerW = width - margin.left - margin.right;
        var innerH = height - margin.top - margin.bottom;
        var data = skillKeys.map(function (key) {
          return { key: key, gap: Math.max(0, state.target - s.averages[key]), score: s.averages[key] };
        }).sort(function (a,b) { return b.gap - a.gap; });

        var svg = d3.select("#gapChart").append("svg").attr("width", width).attr("height", height);
        var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
        var x = d3.scale.linear().domain([0, Math.max(2.5, d3.max(data, function(d){ return d.gap; }) + .2)]).range([0, innerW]);
        var y = d3.scale.ordinal().domain(data.map(function(d){ return d.key; })).rangeRoundBands([0, innerH], .25);

        g.append("g").attr("class","gridline")
          .selectAll("line").data(x.ticks(5)).enter().append("line")
          .attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", innerH);

        g.selectAll(".gap-bar").data(data).enter().append("rect")
          .attr("class","gap-bar")
          .attr("x",0).attr("y",function(d){return y(d.key);})
          .attr("height", y.rangeBand())
          .attr("width",0)
          .attr("rx",6).attr("ry",6)
          .style("fill","#3659d9")
          .on("mousemove", function(d){
            showTip("<strong>"+d.key+"</strong><br>현재 "+fmt1(d.score)+"<br>목표까지 "+fmt1(d.gap), d3.event);
          }).on("mouseout", hideTip)
          .transition().duration(550)
          .attr("width",function(d){return x(d.gap);});

        g.selectAll(".gap-label").data(data).enter().append("text")
          .attr("x",function(d){return x(d.gap)+7;})
          .attr("y",function(d){return y(d.key)+y.rangeBand()/2;})
          .attr("dominant-baseline","middle")
          .style("font-size","12px").style("font-weight","700").style("fill","#344054")
          .text(function(d){return fmt1(d.gap);});

        g.append("g").attr("class","axis").call(d3.svg.axis().scale(y).orient("left").tickSize(0));
        g.append("g").attr("class","axis").attr("transform","translate(0,"+innerH+")")
          .call(d3.svg.axis().scale(x).orient("bottom").ticks(5));
      }

      function renderIssues(s) {
        clearHost("#issueChart");
        var data = s.issues.filter(function(d){ return d.value > 0; });
        if (!data.length) {
          d3.select("#issueChart").append("div").attr("class","empty-state").text("등록된 교정 이슈가 없습니다.");
          return;
        }
        var host = document.getElementById("issueChart");
        var width = Math.max(300, host.clientWidth);
        var height = 300;
        var radius = Math.min(width, height) * .34;
        var total = d3.sum(data, function(d){return d.value;});
        var colors = ["#3659d9","#7488e5","#b6c1f1"];
        var svg = d3.select("#issueChart").append("svg").attr("width",width).attr("height",height);
        var g = svg.append("g").attr("transform","translate("+width*.42+","+height*.5+")");
        var pie = d3.layout.pie().sort(null).value(function(d){return d.value;});
        var arc = d3.svg.arc().innerRadius(radius*.58).outerRadius(radius);
        g.selectAll("path").data(pie(data)).enter().append("path")
          .attr("d",arc)
          .style("fill",function(d,i){return colors[i];})
          .style("stroke","white").style("stroke-width",3)
          .on("mousemove",function(d){
            var pct = d.data.value/total*100;
            showTip("<strong>"+d.data.name+"</strong><br>"+d.data.value+"건 · "+fmt1(pct)+"%", d3.event);
          }).on("mouseout",hideTip);

        g.append("text").attr("text-anchor","middle").attr("dy","-.1em")
          .style("font-size","28px").style("font-weight","800").style("fill","#172033").text(total);
        g.append("text").attr("text-anchor","middle").attr("dy","1.35em")
          .style("font-size","12px").style("fill","#667085").text("총 이슈");

        var legend = svg.append("g").attr("transform","translate("+Math.max(width*.72,210)+","+(height*.31)+")");
        var item = legend.selectAll("g").data(data).enter().append("g")
          .attr("transform",function(d,i){return "translate(0,"+(i*48)+")";});
        item.append("circle").attr("r",6).style("fill",function(d,i){return colors[i];});
        item.append("text").attr("x",14).attr("y",-2).style("font-size","12px").style("fill","#344054").text(function(d){return d.name;});
        item.append("text").attr("x",14).attr("y",16).style("font-size","12px").style("font-weight","800").text(function(d){return d.value+"건";});
      }

      function renderTrend(s) {
        clearHost("#trendChart");
        if (!s.count) return;
        var host = document.getElementById("trendChart");
        var width = Math.max(300, host.clientWidth);
        var height = 300;
        var margin = {top:24,right:30,bottom:46,left:44};
        var innerW=width-margin.left-margin.right, innerH=height-margin.top-margin.bottom;
        var svg=d3.select("#trendChart").append("svg").attr("width",width).attr("height",height);
        var g=svg.append("g").attr("transform","translate("+margin.left+","+margin.top+")");
        var data=s.sessions.map(function(d,i){return {date:d.date, score:Number(d.overall||0), index:i};});
        var x=d3.scale.linear().domain([0,Math.max(2,data.length-1)]).range([0,innerW]);
        var y=d3.scale.linear().domain([4,10]).range([innerH,0]);

        g.selectAll(".hline").data(y.ticks(6)).enter().append("line")
          .attr("class","hline").attr("x1",0).attr("x2",innerW).attr("y1",y).attr("y2",y)
          .style("stroke","#e8edf4").style("stroke-dasharray","3 4");

        g.append("line").attr("x1",0).attr("x2",innerW).attr("y1",y(state.target)).attr("y2",y(state.target))
          .style("stroke","#9cacdf").style("stroke-width",2).style("stroke-dasharray","6 5");
        g.append("text").attr("x",innerW).attr("y",y(state.target)-6).attr("text-anchor","end")
          .style("font-size","11px").style("fill","#6474b8").text("목표 "+fmt1(state.target));

        if (data.length > 1) {
          var line=d3.svg.line().x(function(d){return x(d.index);}).y(function(d){return y(d.score);}).interpolate("monotone");
          g.append("path").datum(data).attr("d",line).style("fill","none").style("stroke","#3659d9").style("stroke-width",3);
        } else {
          [1,2].forEach(function(i){
            g.append("circle").attr("cx",x(i)).attr("cy",y(data[0].score)).attr("r",5)
              .style("fill","#eef2ff").style("stroke","#b8c2ec").style("stroke-dasharray","2 2");
          });
          g.append("text").attr("x",innerW*.54).attr("y",innerH*.2).attr("text-anchor","middle")
            .style("fill","#667085").style("font-size","12px").text("3회부터 추세 해석 활성화");
        }

        g.selectAll(".trend-dot").data(data).enter().append("circle")
          .attr("class","trend-dot").attr("cx",function(d){return x(d.index);}).attr("cy",function(d){return y(d.score);})
          .attr("r",6).style("fill","#3659d9").style("stroke","white").style("stroke-width",2)
          .on("mousemove",function(d){showTip("<strong>"+d.date+"</strong><br>종합 "+fmt1(d.score),d3.event);})
          .on("mouseout",hideTip);

        g.append("g").attr("class","axis").call(d3.svg.axis().scale(y).orient("left").ticks(6));
        var ticks = data.map(function(d){return d.index;});
        g.append("g").attr("class","axis").attr("transform","translate(0,"+innerH+")")
          .call(d3.svg.axis().scale(x).orient("bottom").tickValues(ticks).tickFormat(function(i){
            return data[i] ? data[i].date.slice(5).replace("-","/") : "";
          }));
      }

      function collide(node) {
        var r = node.r + 7;
        var nx1 = node.x - r, nx2 = node.x + r, ny1 = node.y - r, ny2 = node.y + r;
        return function(quad, x1, y1, x2, y2) {
          if (quad.point && quad.point !== node) {
            var x = node.x - quad.point.x, y = node.y - quad.point.y;
            var l = Math.sqrt(x*x + y*y);
            var rr = node.r + quad.point.r + 7;
            if (l < rr && l > 0) {
              l = (l - rr) / l * .5;
              node.x -= x *= l; node.y -= y *= l;
              quad.point.x += x; quad.point.y += y;
            }
          }
          return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
        };
      }

      function aggregateKeywords(sessions) {
        var map = {};
        sessions.forEach(function(session){
          (session.keywords || []).forEach(function(k){
            var key = String(k.text || "").trim();
            if (!key) return;
            map[key] = (map[key] || 0) + Number(k.weight || 1);
          });
        });
        return Object.keys(map).map(function(k){return {text:k,weight:map[k]};})
          .sort(function(a,b){return b.weight-a.weight;}).slice(0,28);
      }

      function renderWordCloud(s) {
        clearHost("#wordCloud");
        var data=aggregateKeywords(s.sessions);
        if (!data.length) {
          d3.select("#wordCloud").append("div").attr("class","empty-state").text("표시할 학습 키워드가 없습니다.");
          return;
        }
        var host=document.getElementById("wordCloud");
        var width=Math.max(300,host.clientWidth), height=300;
        var scale=d3.scale.linear().domain(d3.extent(data,function(d){return d.weight;})).range([17,42]);
        var nodes=data.map(function(d,i){
          var fs=scale(d.weight);
          return {text:d.text,weight:d.weight,fontSize:fs,r:Math.max(24,d.text.length*fs*.26),x:width/2+(i%3-1)*15,y:height/2+(i%4-2)*12};
        });
        var svg=d3.select("#wordCloud").append("svg").attr("width",width).attr("height",height);
        var g=svg.append("g");
        var color=d3.scale.linear().domain([0,nodes.length-1]).range(["#2948b8","#9cacdf"]);
        var text=g.selectAll("text").data(nodes).enter().append("text")
          .attr("text-anchor","middle")
          .style("font-size",function(d){return d.fontSize+"px";})
          .style("font-weight",function(d){return d.weight>=8?800:600;})
          .style("fill",function(d,i){return color(i);})
          .style("opacity",0)
          .text(function(d){return d.text;})
          .on("mousemove",function(d){showTip("<strong>"+d.text+"</strong><br>현재 중요도 "+d.weight,d3.event);})
          .on("mouseout",hideTip);

        var force=d3.layout.force().nodes(nodes).size([width,height]).gravity(.12).charge(function(d){return -Math.pow(d.r,1.35);}).friction(.82);
        force.on("tick",function(e){
          var q=d3.geom.quadtree(nodes);
          nodes.forEach(function(n){q.visit(collide(n));});
          nodes.forEach(function(n){
            n.x=Math.max(n.r,Math.min(width-n.r,n.x));
            n.y=Math.max(24,Math.min(height-24,n.y));
          });
          text.attr("x",function(d){return d.x;}).attr("y",function(d){return d.y;});
        });
        force.start();
        for(var i=0;i<150;i++) force.tick();
        force.stop();
        text.transition().duration(500).style("opacity",1);
      }

      function renderInsights(s) {
        var entries = skillKeys.map(function(k){return {key:k,value:s.averages[k]};}).sort(function(a,b){return b.value-a.value;});
        var strongest=entries[0]||{key:"-",value:0}, weakest=entries[entries.length-1]||{key:"-",value:0};
        var issueTotal=d3.sum(s.issues,function(d){return d.value;});
        var largestIssue=s.issues.slice().sort(function(a,b){return b.value-a.value;})[0];
        var trendText=s.count<3
          ? "실제 기록이 "+s.count+"회이므로 발전 속도와 정체 여부는 아직 판단하지 않습니다."
          : "최근 세션의 종합점수 방향성을 확인할 수 있습니다.";
        var cards=[
          {title:"현재 강점",body:"<span class='accent'>"+strongest.key+" "+fmt1(strongest.value)+"</span>로 가장 높습니다. 업무 발화를 끊지 않고 이어가는 능력을 구조화된 설명으로 확장하는 것이 다음 단계입니다."},
          {title:"가장 큰 보완 격차",body:"<span class='accent'>"+weakest.key+"</span>이 현재 가장 낮고 목표 "+fmt1(state.target)+"까지 "+fmt1(Math.max(0,state.target-weakest.value))+"점 남아 있습니다."},
          {title:"데이터 해석 한계",body:trendText},
          {title:"교정 이슈",body:issueTotal ? "현재 기록된 이슈 중 <span class='accent'>"+largestIssue.name+" "+largestIssue.value+"건</span>이 가장 큽니다. 단, 반복성 판단은 5회 이후에 합니다." : "현재 등록된 교정 이슈가 없습니다."},
          {title:"다음 역할극",body:s.latest ? s.latest.nextChallenge : "실제 세션이 추가되면 자동 제안됩니다."},
          {title:"관리 원칙",body:"점수 추세보다 <span class='accent'>같은 오류의 재발 감소</span>와 2분 이상 논리적 발화 가능 여부를 우선 평가합니다."}
        ];
        var host=d3.select("#insightGrid");
        host.selectAll("*").remove();
        var card=host.selectAll("article").data(cards).enter().append("article").attr("class","card insight-card");
        card.append("h3").text(function(d){return d.title;});
        card.append("p").each(function(d){setSafeHtml(this,d.body,["span"]);});
      }

      function renderPriorities(s) {
        var scores=skillKeys.map(function(k){return {key:k,value:s.averages[k],gap:state.target-s.averages[k]};}).sort(function(a,b){return b.gap-a.gap;});
        var latest=s.latest||{};
        var priorities=[
          {title:"정확도 집중",desc:(latest.feedback || "전치사와 관사 같은 고빈도 오류를 재발화로 줄입니다.")},
          {title:"논리 구조 확장",desc:"상황 → 영향 → 대응 → 요청 순서로 최소 90초 이상 설명합니다."},
          {title:"즉흥 대응",desc:"예상하지 못한 추가 질문을 받은 뒤 결론부터 답하고 근거를 덧붙입니다."}
        ];
        if (scores.length && scores[0].key==="발음") {
          priorities[0]={title:"발음 연결과 강세",desc:"회의 전환 표현을 문장 단위로 말하며 핵심어 강세와 자음 연결을 안정화합니다."};
          priorities[1]={title:"정확도 병행",desc:"전치사·관사를 교정 문장에 포함해 2회 연속 정확하게 재발화합니다."};
        }
        var host=d3.select("#priorityList");
        host.selectAll("*").remove();
        var li=host.selectAll("li").data(priorities).enter().append("li");
        li.append("div").attr("class","rank").text(function(d,i){return i+1;});
        var body=li.append("div");
        body.append("strong").text(function(d){return d.title;});
        body.append("span").text(function(d){return d.desc;});
      }

      function renderGates(s) {
        var gates=[
          {label:"기준선",need:1,desc:"현재 상태"},
          {label:"추세",need:3,desc:"상승·하락"},
          {label:"반복성",need:5,desc:"재발 오류"},
          {label:"이동평균",need:7,desc:"난이도 조정"}
        ];
        var host=d3.select("#gateGrid");
        host.selectAll("*").remove();
        var row=host.selectAll(".gate-row").data(gates).enter().append("div").attr("class","gate-row");
        row.append("div").attr("class","gate-label").text(function(d){return d.label;});
        var track=row.append("div").attr("class","track");
        track.append("div").attr("class","fill").style("width",function(d){return Math.min(100,s.count/d.need*100)+"%";});
        row.append("div").attr("class","gate-status").text(function(d){return s.count>=d.need?"활성":" "+s.count+"/"+d.need+"회";});
      }

      function renderTable(s) {
        var body=d3.select("#sessionTableBody");
        body.selectAll("*").remove();
        var rows=body.selectAll("tr").data(s.sessions.slice().reverse()).enter().append("tr");
        rows.selectAll("td").data(function(d){
          return [
            d.date,d.sessionType,d.topic,d.minutes,d.speakingTurns,
            (d.scores||{})["유창성"],(d.scores||{})["문법"],(d.scores||{})["어휘·표현"],
            (d.scores||{})["발음"],(d.scores||{})["자신감"],d.overall,d.nextChallenge
          ];
        }).enter().append("td").text(function(d){return d==null?"":d;});
      }

      function renderFooter(s) {
        d3.select("#footerText").text(
          "데이터 기준: 실제 완료 세션 "+s.count+"회 · 샘플 제외 · 생성일 "+(state.meta.generatedAt||"")+
          " · "+(state.meta.dataPolicy||"")
        );
      }

      function renderAll() {
        var s=summary();
        renderKpis(s);
        renderReadiness(s);
        renderRadar(s);
        renderGap(s);
        renderIssues(s);
        renderTrend(s);
        renderWordCloud(s);
        renderInsights(s);
        renderPriorities(s);
        renderGates(s);
        renderTable(s);
        renderFooter(s);
      }

      function safeFilename(name) {
        return name.replace(/[^\w가-힣.-]+/g,"_");
      }
      function downloadBlob(content,type,filename) {
        var blob=new Blob([content],{type:type});
        var url=URL.createObjectURL(blob);
        var a=document.createElement("a");
        a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
        setTimeout(function(){URL.revokeObjectURL(url);},500);
      }
      function dataPayload() {
        return {meta:Object.assign({},state.meta,{targetScore:state.target}),sessions:completedSessions()};
      }
      function csvEscape(v) {
        var s=String(v==null?"":v);
        return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
      }

      document.getElementById("targetRange").addEventListener("input",function(){
        state.target=Number(this.value);
        document.getElementById("targetValue").textContent=fmt1(state.target);
        renderAll();
      });
      document.getElementById("targetValue").textContent=fmt1(state.target);
      document.getElementById("targetRange").value=state.target;

      document.getElementById("downloadJsonBtn").addEventListener("click",function(){
        downloadBlob(JSON.stringify(dataPayload(),null,2),"application/json;charset=utf-8","english_coach_data.json");
      });
      document.getElementById("downloadCsvBtn").addEventListener("click",function(){
        var headers=["Date","Session type","Topic","Minutes","Speaking turns","Fluency","Grammar","Vocabulary","Pronunciation","Confidence","Overall","Grammar errors","Expression gaps","Pronunciation issues","Next challenge"];
        var lines=[headers.join(",")];
        completedSessions().forEach(function(s){
          var row=[s.date,s.sessionType,s.topic,s.minutes,s.speakingTurns,(s.scores||{})["유창성"],(s.scores||{})["문법"],(s.scores||{})["어휘·표현"],(s.scores||{})["발음"],(s.scores||{})["자신감"],s.overall,s.grammarErrors,s.expressionGaps,s.pronunciationIssues,s.nextChallenge];
          lines.push(row.map(csvEscape).join(","));
        });
        downloadBlob("\ufeff"+lines.join("\n"),"text/csv;charset=utf-8","english_coach_sessions.csv");
      });
      document.getElementById("printBtn").addEventListener("click",function(){window.print();});
      document.getElementById("downloadHtmlBtn").addEventListener("click",function(){
        var inlineData=JSON.stringify(dataPayload()).replace(/[<>&\u2028\u2029]/g,function(character){
          return "\\u"+("0000"+character.charCodeAt(0).toString(16)).slice(-4);
        });
        document.getElementById("dashboard-data").textContent=inlineData;
        var serialized="<!doctype html>\n"+document.documentElement.outerHTML;
        downloadBlob(serialized,"text/html;charset=utf-8","AI_English_Coach_Interactive_Dashboard_updated.html");
      });
      document.getElementById("jsonUpload").addEventListener("change",function(e){
        var file=e.target.files && e.target.files[0];
        if(!file)return;
        var reader=new FileReader();
        reader.onload=function(){
          try{
            var incoming=JSON.parse(reader.result);
            var sessions=Array.isArray(incoming)?incoming:incoming.sessions;
            if(!Array.isArray(sessions))throw new Error("sessions 배열이 없습니다.");
            sessions.forEach(function(s,i){
              if(!s.date || !s.scores)throw new Error((i+1)+"번째 세션에 date 또는 scores가 없습니다.");
            });
            state.sessions=sessions.filter(function(s){return s.completed!==false;});
            if(incoming.meta)state.meta=Object.assign({},state.meta,incoming.meta);
            if(incoming.meta && incoming.meta.targetScore){
              state.target=Number(incoming.meta.targetScore);
              document.getElementById("targetRange").value=state.target;
              document.getElementById("targetValue").textContent=fmt1(state.target);
            }
            renderAll();
            document.getElementById("statusMessage").style.color="";
            document.getElementById("statusMessage").textContent="JSON 데이터를 불러왔습니다. 현재 데이터 포함 HTML 저장으로 새 파일을 보관할 수 있습니다.";
          }catch(err){
            document.getElementById("statusMessage").style.color="var(--danger)";
            document.getElementById("statusMessage").textContent="불러오기 실패: "+err.message;
          }
        };
        reader.readAsText(file,"utf-8");
      });

      var resizeTimer;
      window.addEventListener("resize",function(){
        clearTimeout(resizeTimer);
        resizeTimer=setTimeout(renderAll,180);
      });

      renderAll();
})();
